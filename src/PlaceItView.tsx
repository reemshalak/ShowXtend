/**
 * PlaceItView — "Place It" mode.
 *
 * FIXES:
 * - Module-level tripoCache keyed by product.id so Tripo3D only generates
 *   ONCE per session even when navigating back and returning.
 * - Objects persist across navigation (sceneStore is a module singleton).
 * - Tripo URL stored on the PlacedObject.modelUrl so web scene uses it.
 * - DesktopToolbar shows Retry button (clickable) when tripoStatus === 'error'.
 * - All broadcastObject/session.send calls preserved for web↔XR sync.
 */

import { useEffect, useRef, useState } from 'react';
import { initScene } from '@webspatial/react-sdk';
import { isXRMode } from './xrMode';
import type { Product } from './data';
import { PRODUCTS } from './data';
import { generateTripo3DModel, type Tripo3DStatus } from './tripo3d';
import Shared3DScene from './Shared3DScene';
import { sceneStore, makeObject, type PlacedObject } from './sceneStore';
import { getSession } from './collaboration';
import { broadcastObject, broadcastScene, onSceneMessage } from './Xrwindowbridge';

const LAYOUT_KEY = 'xr-layouts';

// ── Module-level Tripo cache — survives navigation ────────────────────────────
// Key: product.id → { status, url }
const tripoCache = new Map<number, { status: Tripo3DStatus; url: string | null }>();

interface PlaceItViewProps {
  product: Product;
  onBack: () => void;
  onShareToSpace?: () => void;
  hasControl?: boolean;
}

function getRelated(p: Product) { return PRODUCTS.filter(x => x.id !== p.id).slice(0, 4); }

function loadLayouts(): Record<string, PlacedObject[]> {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}'); } catch { return {}; }
}
function saveLayouts(l: Record<string, PlacedObject[]>) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
}

// ── Desktop sub-components ────────────────────────────────────────────────────
function DesktopAlsoLike({ product }: { product: Product }) {
  const related = getRelated(product);
  return (
    <div className="spatial-panel place-left-panel">
      <p className="also-like-title">You may also like</p>
      <div className="also-like-grid">
        {related.map(p => (
          <div key={p.id} className="also-like-card">
            <div className="also-like-thumb">{p.emoji}</div>
            <p className="also-like-name">{p.name.toUpperCase()}</p>
            <p className="also-like-type">{p.type}</p>
            <p className="also-like-price">{p.price}</p>
          </div>
        ))}
      </div>
      <button className="view-more-btn">View more</button>
    </div>
  );
}

function DesktopToolbar({ tripoStatus, onPlace, onBack, onRetry, productCount }: {
  tripoStatus: Tripo3DStatus;
  onPlace: () => void;
  onBack: () => void;
  onRetry: () => void;
  productCount: number;
}) {
  return (
    <div className="spatial-panel place-toolbar-panel" style={{ gap:'0.65rem', minWidth:90 }}>
      {/* Status indicator */}
      <div className={`tripo-status tripo-status--${tripoStatus}`} style={{ fontSize:'0.68rem', padding:'0.3rem', textAlign:'center' }}>
        {tripoStatus === 'generating' && <><span className="tripo-spinner">⟳</span><br/>Gen…</>}
        {tripoStatus === 'ready'      && <>✓<br/>Ready</>}
        {(tripoStatus === 'idle' || tripoStatus === 'placing') && <>⊹<br/>Place</>}
        {tripoStatus === 'error' && (
          <button onClick={onRetry} style={{
            background:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.4)',
            borderRadius:8, color:'#fca5a5', fontSize:'0.62rem', padding:'4px 6px',
            cursor:'pointer', lineHeight:1.3, display:'flex', flexDirection:'column',
            alignItems:'center', gap:2, width:'100%',
          }}>
            ⚠<br/>Retry
          </button>
        )}
      </div>

      {/* Place button */}
      <button className="tool-btn" onClick={onPlace}
        style={{ background:'rgba(99,102,241,0.25)', border:'1px solid rgba(99,102,241,0.5)', color:'#c4b5fd', width:'100%' }}>
        ⊹
      </button>

      <div style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.25)', textAlign:'center' }}>
        {productCount} obj
      </div>
      <div style={{ width:'100%', height:1, background:'rgba(255,255,255,0.08)', marginTop:8 }} />
      <button className="tool-btn" onClick={onBack} style={{ width:'100%', fontSize:'0.7rem' }}>←</button>
    </div>
  );
}

function DesktopCheckout({ product }: { product: Product }) {
  return (
    <div className="spatial-panel place-bottom-panel">
      <div className="checkout-product-row">
        <div className="checkout-thumb">{product.emoji}</div>
        <div className="checkout-info">
          <span className="checkout-name">{product.name.toUpperCase()}</span>
          <span className="checkout-sub">{product.fullType}</span>
        </div>
        <span className="checkout-price">${product.priceNum}</span>
      </div>
      <div className="checkout-divider" />
      <div className="checkout-footer-row">
        <span className="checkout-delivery">Delivery fees not included</span>
        <button className="checkout-btn">Continue to checkout</button>
      </div>
    </div>
  );
}

// ── XR layout panel ───────────────────────────────────────────────────────────
function XRLayoutPanel({ onSave, onLoad, onClear }: {
  onSave: () => void; onLoad: () => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasLayouts = Object.keys(loadLayouts()).length > 0;
  const s: React.CSSProperties = {
    background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)',
    borderRadius:8, padding:'6px 10px', color:'#fff', fontSize:'0.72rem', cursor:'pointer', textAlign:'left',
  };
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'6px 14px', color:'#fff', fontSize:'0.72rem', cursor:'pointer' }}>
        🗂 Layout
      </button>
      {open && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 8px)', right:0,
          background:'rgba(5,5,14,0.95)', backdropFilter:'blur(20px)',
          border:'1px solid rgba(255,255,255,0.14)', borderRadius:14,
          padding:12, minWidth:160, zIndex:200, display:'flex', flexDirection:'column', gap:6,
        }}>
          <button onClick={() => { onSave(); setOpen(false); }} style={s}>💾 Save layout</button>
          {hasLayouts && <button onClick={() => { onLoad(); setOpen(false); }} style={s}>📂 Load layout</button>}
          <button onClick={() => { onClear(); setOpen(false); }} style={{ ...s, color:'#fca5a5', borderColor:'rgba(239,68,68,0.4)' }}>🗑 Clear all</button>
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function PlaceItView({ product, onBack, hasControl = false }: PlaceItViewProps) {
  // Initialise from cache so navigation back doesn't reset
  const cached = tripoCache.get(product.id);
  const [tripoStatus,   setTripoStatus]   = useState<Tripo3DStatus>(cached?.status ?? 'idle');
  const [tripoModelUrl, setTripoModelUrl] = useState<string | null>(cached?.url ?? null);
  const [placedCount,   setPlacedCount]   = useState(() => sceneStore.getObjects().length);
  const isGenerating = useRef(false);
  const xrWindows    = useRef<Map<string, Window | null>>(new Map());

  useEffect(() => sceneStore.subscribe(objs => setPlacedCount(objs.length)), []);

  // ── Tripo3D — uses module cache so navigating back skips re-generation ──────
  const runTripo = () => {
    if (isGenerating.current) return;
    isGenerating.current = true;
    setTripoStatus('generating');
    tripoCache.set(product.id, { status: 'generating', url: null });

    (async () => {
      try {
        await generateTripo3DModel(
          product.imageUrl ?? product.emoji,
          (s: Tripo3DStatus, url?: string) => {
            setTripoStatus(s);
            if (s === 'ready' && url) {
              setTripoModelUrl(url);
              tripoCache.set(product.id, { status: 'ready', url });
            }
            if (s === 'error') {
              tripoCache.set(product.id, { status: 'error', url: null });
            }
          },
        );
      } catch {
        setTripoStatus('error');
        tripoCache.set(product.id, { status: 'error', url: null });
      } finally {
        isGenerating.current = false;
      }
    })();
  };

  useEffect(() => {
    // Only auto-start if not cached yet
    if (!tripoCache.has(product.id)) {
      runTripo();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // ── Multiplayer remote events ─────────────────────────────────────────────
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    return session.onEvent((event) => {
      if ((event as any).type !== 'control_action') return;
      const { action, data } = event as any;
      if (action === 'scene_object_placed' && data?.object) {
        sceneStore.addObject(data.object);
        if (isXRMode) openXRWindow(data.object, data.object.modelUrl ?? null);
      }
      if (action === 'scene_object_moved' && data?.id) {
        sceneStore.moveObject(data.id, data.transform);
        broadcastObject(data.id, { type:'move', payload:{ transform:data.transform } });
      }
      if (action === 'scene_object_color' && data?.id) {
        sceneStore.setColor(data.id, data.color);
        broadcastObject(data.id, { type:'color', payload:{ color:data.color } });
      }
      if (action === 'scene_object_delete' && data?.id) {
        sceneStore.deleteObject(data.id);
        broadcastObject(data.id, { type:'delete' });
      }
      if (action === 'scene_object_duplicate' && data?.id) {
        sceneStore.duplicateObject(data.id);
      }
    });
  }, []);

  // ── Bridge from XRModelWindow → web scene ─────────────────────────────────
  useEffect(() => {
    return onSceneMessage((msg) => {
      switch (msg.type) {
        case 'obj_deleted':
          sceneStore.deleteObject(msg.payload.id);
          const existing = xrWindows.current.get(msg.payload.id);
          existing?.close();
          xrWindows.current.delete(msg.payload.id);
          break;
        case 'obj_placed': {
          const newObj = sceneStore.getObjects().find(o => o.id === msg.payload.id);
          if (newObj && isXRMode) openXRWindow(newObj, newObj.modelUrl ?? null);
          break;
        }
        case 'scene_cleared':
          for (const [, w] of xrWindows.current) w?.close();
          xrWindows.current.clear();
          sceneStore.clearAll();
          break;
        case 'scene_loaded':
          for (const [, w] of xrWindows.current) w?.close();
          xrWindows.current.clear();
          sceneStore.clearAll?.();
          for (const o of msg.payload.objects) {
            sceneStore.addObject(o);
            if (isXRMode) openXRWindow(o, o.modelUrl ?? null);
          }
          break;
      }
    });
  }, []);

  // ── Open one XRModelWindow ────────────────────────────────────────────────
function openXRWindow(obj: PlacedObject, modelUrl: string | null) {
  const winName = `xr-model-${obj.id}`;
  const objData = encodeURIComponent(JSON.stringify({
    id: obj.id,
    type: obj.type,
    emoji: obj.emoji,
    label: obj.label,
    color: obj.color,
    transform: obj.transform,
  }));
  const url = modelUrl
    ? `/xr-model?data=${objData}&modelUrl=${encodeURIComponent(modelUrl)}`
    : `/xr-model?data=${objData}`;

  const idx = (obj as any).offsetIndex ?? sceneStore.getObjects().findIndex(o => o.id === obj.id);
  
  // ✅ Open window FIRST
  const win = window.open(url, winName);
  
  // ✅ THEN initialize the scene (only if window opened successfully)
  if (win) {
    initScene(winName, (cfg) => ({
      ...cfg,
      defaultSize: { width: 260, height: 260 },
      defaultPosition: {
        x: (idx % 3) * 150 - 150,
        y: Math.floor(idx / 3) * -170,
        z: -0.8,
      },
    }));
  } else {
    console.error('[PlaceItView] Failed to open window for object:', obj.id);
  }
  
  xrWindows.current.set(obj.id, win);
}

  // ── Place handlers ────────────────────────────────────────────────────────
  const handlePlace = () => {
    const idx = sceneStore.getObjects().length;
    const obj = makeObject('product', {
      productId:     product.id,
      emoji:         product.emoji,
      label:         product.name,
      color:         '#c8b89a',
      participantId: getSession()?.participantId ?? 'local',
      offsetIndex:   idx,
      modelUrl:      tripoModelUrl,  // pass Tripo URL into the object
    });
    sceneStore.addObject(obj);
    if (isXRMode) openXRWindow(obj, tripoModelUrl);
    broadcastScene({ type:'obj_placed', payload:obj });
    getSession()?.send({ type:'control_action', action:'scene_object_placed', data:{ object:obj } } as any);
  };

  const handlePlaceShape = (type: 'cube'|'sphere'|'cone') => {
    const colors  = { cube:'#ef4444', sphere:'#3b82f6', cone:'#f59e0b' };
    const emojis  = { cube:'⬛', sphere:'⚫', cone:'🔺' };
    const idx = sceneStore.getObjects().length;
    const obj = makeObject(type, {
      color:         colors[type],
      participantId: getSession()?.participantId ?? 'local',
      offsetIndex:   idx,
      label:         type.charAt(0).toUpperCase()+type.slice(1),
      emoji:         emojis[type],
    });
    sceneStore.addObject(obj);
    if (isXRMode) openXRWindow(obj, null);
    broadcastScene({ type:'obj_placed', payload:obj });
    getSession()?.send({ type:'control_action', action:'scene_object_placed', data:{ object:obj } } as any);
  };

  // ── Layout ops ────────────────────────────────────────────────────────────
  const handleSaveLayout = () => {
    const name = `Layout ${new Date().toLocaleTimeString()}`;
    const l = loadLayouts(); l[name] = sceneStore.getObjects(); saveLayouts(l);
  };
  const handleLoadLayout = () => {
    const l = loadLayouts(); const keys = Object.keys(l); if (!keys.length) return;
    const objs: PlacedObject[] = l[keys[keys.length-1]];
    if (isXRMode) { for (const [,w] of xrWindows.current) w?.close(); xrWindows.current.clear(); }
    sceneStore.clearAll?.();
    for (const o of objs) { sceneStore.addObject(o); if (isXRMode) openXRWindow(o, o.modelUrl ?? null); }
    broadcastScene({ type:'scene_loaded', payload:{ objects:objs } });
  };
  const handleClearAll = () => {
    if (isXRMode) { for (const [,w] of xrWindows.current) w?.close(); xrWindows.current.clear(); }
    sceneStore.clearAll?.();
    broadcastScene({ type:'scene_cleared' });
  };

  // ── XR ────────────────────────────────────────────────────────────────────
  if (isXRMode) {
    return (
      <>
        <button enable-xr className="place-back-btn" onClick={onBack}>←</button>
        <div enable-xr className="spatial-panel" style={{
          position:'absolute', bottom:28, left:'50%', transform:'translateX(-50%)',
          width:'auto', maxWidth:500, padding:'10px 16px', borderRadius:22,
          background:'rgba(12,12,22,0.88)', backdropFilter:'blur(22px)',
          border:'1px solid rgba(255,255,255,0.12)',
          display:'flex', flexDirection:'column', alignItems:'center', gap:8, zIndex:100,
        }}>
          <div className={`tripo-status tripo-status--${tripoStatus}`} style={{ fontSize:'0.72rem', textAlign:'center' }}>
            {tripoStatus==='generating' && <>⟳ Generating 3D model…</>}
            {tripoStatus==='ready'      && <>✓ 3D model ready</>}
            {tripoStatus==='idle'       && <>{product.emoji} {product.name}</>}
            {tripoStatus==='error'      && (
              <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                ⚠ Failed ·
                <button onClick={runTripo} style={{
                  background:'rgba(99,102,241,0.25)', border:'1px solid rgba(99,102,241,0.4)',
                  borderRadius:6, color:'#c4b5fd', fontSize:'0.65rem', padding:'2px 8px', cursor:'pointer',
                }}>Retry</button>
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button className="place-it-btn" onClick={handlePlace}
              style={{ padding:'8px 16px', fontSize:'0.8rem', borderRadius:12 }}>
              ⊹ Place {product.emoji}
            </button>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.12)' }} />
            <XRLayoutPanel onSave={handleSaveLayout} onLoad={handleLoadLayout} onClear={handleClearAll} />
          </div>
          {placedCount > 0 && (
            <p style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.35)', margin:0, textAlign:'center' }}>
              {placedCount} object{placedCount!==1?'s':''} · tap any object for controls
            </p>
          )}
        </div>
      </>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 2rem)', overflow:'hidden', padding:'1rem 1.5rem', gap:'0.75rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <button className="browse-back-btn" onClick={onBack}>← All products</button>
          <span style={{ fontSize:'0.85rem', fontWeight:700, color:'rgba(255,255,255,0.7)' }}>
            {product.emoji} {product.name} · Place It
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          {hasControl && (
            <span style={{ fontSize:'0.7rem', background:'rgba(16,185,129,0.18)', border:'1px solid rgba(16,185,129,0.4)', color:'#6ee7b7', borderRadius:100, padding:'0.2rem 0.7rem', fontWeight:600 }}>
              🎮 You control the scene
            </span>
          )}
          <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)' }}>
            {placedCount} object{placedCount!==1?'s':''}
          </span>
          <XRLayoutPanel onSave={handleSaveLayout} onLoad={handleLoadLayout} onClear={handleClearAll} />
        </div>
      </div>

      <div style={{ display:'flex', gap:'1rem', flex:1, minHeight:0 }}>
        <DesktopAlsoLike product={product} />
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <div style={{ flex:1, minHeight:0 }}>
            <Shared3DScene />
          </div>
        </div>
        <DesktopToolbar
          tripoStatus={tripoStatus}
          onPlace={handlePlace}
          onBack={onBack}
          onRetry={runTripo}
          productCount={placedCount}
        />
      </div>

      <DesktopCheckout product={product} />
    </div>
  );
}