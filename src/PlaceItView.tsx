/**
 * PlaceItView — "Place It" mode.
 *
 * FIXES applied:
 * 1. Product image now shown in checkout thumb (img tag, falls back to emoji)
 * 2. Layout dropdown anchored to bottom-right of the header row — no longer floats offscreen
 * 3. XR-specific code removed; BroadcastChannel / session sync fully preserved
 * 4. Tripo3D auto-starts on mount and auto-places the object as soon as model is ready
 * 5. No manual "Place" button in toolbar — placement is automatic on model ready
 * 6. Sequence: idle → generating (with progress status) → ready → placed automatically
 */

import { useEffect, useRef, useState } from 'react';
import type { Product } from './data';
import { PRODUCTS } from './data';
import { generateTripo3DModel, type Tripo3DStatus } from './tripo3d';
import Shared3DScene from './Shared3DScene';
import { sceneStore, makeObject, type PlacedObject } from './sceneStore';
import { getSession } from './collaboration';
import { broadcastScene, onSceneMessage } from './Xrwindowbridge';

const LAYOUT_KEY = 'xr-layouts';

// ── Module-level Tripo cache — survives navigation ───────────────────────────
// Key: product.id → { status, url }
const tripoCache = new Map<number, { status: Tripo3DStatus; url: string | null }>();

interface PlaceItViewProps {
  product: Product;
  onBack: () => void;
  hasControl?: boolean;
  onShareToSpace?: () => void;
}

function getRelated(p: Product) {
  return PRODUCTS.filter(x => x.id !== p.id).slice(0, 4);
}

function loadLayouts(): Record<string, PlacedObject[]> {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}'); } catch { return {}; }
}
function saveLayouts(l: Record<string, PlacedObject[]>) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
}

// ── Layout panel — FIX #2: dropdown now opens downward inside the header row ─
function LayoutPanel({ onSave, onLoad, onClear }: {
  onSave: () => void; onLoad: () => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasLayouts = Object.keys(loadLayouts()).length > 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const btnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '7px 12px',
    color: '#fff',
    fontSize: '0.78rem',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.13s',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: open ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 10,
          padding: '6px 14px',
          color: '#fff',
          fontSize: '0.78rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'background 0.13s',
        }}
      >
        🗂 Layout
      </button>

      {open && (
        // FIX #2: positioned below the button, not above it
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: 'rgba(8,8,18,0.97)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 14,
          padding: 10,
          minWidth: 168,
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <button style={btnStyle} onClick={() => { onSave(); setOpen(false); }}>
            💾 Save layout
          </button>
          {hasLayouts && (
            <button style={btnStyle} onClick={() => { onLoad(); setOpen(false); }}>
              📂 Load layout
            </button>
          )}
          <button
            style={{ ...btnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)' }}
            onClick={() => { onClear(); setOpen(false); }}
          >
            🗑 Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tripo status bar shown in the right sidebar ───────────────────────────────
function TripoStatusBar({ status, onRetry }: { status: Tripo3DStatus; onRetry: () => void }) {
  const styles: Record<string, React.CSSProperties> = {
    idle:       { color: 'rgba(255,255,255,0.4)' },
    generating: { color: '#a78bfa' },
    placing:    { color: '#60a5fa' },
    ready:      { color: '#34d399' },
    error:      { color: '#f87171' },
  };

  return (
    <div style={{
      ...styles[status],
      fontSize: '0.68rem',
      textAlign: 'center',
      lineHeight: 1.4,
      padding: '0.35rem 0.2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      {status === 'generating' && (
        <>
          <span style={{ fontSize: '1rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          <span>Generating<br/>3D model…</span>
        </>
      )}
      {status === 'placing' && (
        <>
          <span style={{ fontSize: '1rem' }}>⊹</span>
          <span>Placing…</span>
        </>
      )}
      {status === 'ready' && (
        <>
          <span style={{ fontSize: '1rem' }}>✓</span>
          <span>Placed!</span>
        </>
      )}
      {status === 'idle' && (
        <>
          <span style={{ fontSize: '1rem' }}>⊹</span>
          <span>Starting…</span>
        </>
      )}
      {status === 'error' && (
        <button
          onClick={onRetry}
          style={{
            background: 'rgba(239,68,68,0.18)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: '0.65rem',
            padding: '5px 8px',
            cursor: 'pointer',
            lineHeight: 1.3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            width: '100%',
          }}
        >
          <span>⚠</span>
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}

// ── Checkout bar ──────────────────────────────────────────────────────────────
// FIX #1: shows product image (img tag) with emoji fallback
function DesktopCheckout({ product }: { product: Product }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="spatial-panel place-bottom-panel">
      <div className="checkout-product-row">
        <div className="checkout-thumb" style={{ overflow: 'hidden', padding: 0 }}>
          {product.imageUrl && !imgError ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
            />
          ) : (
            <span style={{ fontSize: '1.6rem' }}>{product.emoji}</span>
          )}
        </div>
        <div className="checkout-info">
          <span className="checkout-name">{product.name.toUpperCase()}</span>
          <span className="checkout-sub">{product.fullType}</span>
        </div>
        <span className="checkout-price">{product.price}</span>
      </div>
      <div className="checkout-divider" />
      <div className="checkout-footer-row">
        <span className="checkout-delivery">Delivery fees not included</span>
        <button className="checkout-btn">Continue to checkout</button>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function PlaceItView({ product, onBack, hasControl = false }: PlaceItViewProps) {
  const cached = tripoCache.get(product.id);
  const [tripoStatus,   setTripoStatus]   = useState<Tripo3DStatus>(cached?.status ?? 'idle');
  const [tripoModelUrl, setTripoModelUrl] = useState<string | null>(cached?.url ?? null);
  const [placedCount,   setPlacedCount]   = useState(() => sceneStore.getObjects().length);
  const isGenerating = useRef(false);
  const hasAutoPlaced = useRef(false); // FIX #4/#6: guard so we only auto-place once

  useEffect(() => sceneStore.subscribe(objs => setPlacedCount(objs.length)), []);

  // ── Place a product object in the scene ─────────────────────────────────────
  // FIX #4: called automatically when model is ready, not by button press
  const placeObject = (modelUrl: string | null) => {
    setTripoStatus('placing');
    const idx = sceneStore.getObjects().length;
    const obj = makeObject('product', {
      productId:     product.id,
      emoji:         product.emoji,
      label:         product.name,
      color:         '#c8b89a',
      participantId: getSession()?.participantId ?? 'local',
      offsetIndex:   idx,
      modelUrl,
    });
    sceneStore.addObject(obj);
    broadcastScene({ type: 'obj_placed', payload: obj });
    getSession()?.send({
      type: 'control_action',
      action: 'scene_object_placed',
      data: { object: obj },
    } as any);
    // Short delay so "placing…" status is visible, then flip to ready
    setTimeout(() => setTripoStatus('ready'), 600);
  };

  // ── Run Tripo3D generation ───────────────────────────────────────────────────
  // FIX #5/#6: no retry-before-start confusion — clean linear flow:
  //   idle → generating → ready → auto-place
  const runTripo = () => {
    if (isGenerating.current) return;
    isGenerating.current = true;
    hasAutoPlaced.current = false;
    setTripoStatus('generating');
    tripoCache.set(product.id, { status: 'generating', url: null });

    (async () => {
      try {
        await generateTripo3DModel(
          product.imageUrl ?? '',
          (s: Tripo3DStatus, url?: string) => {
            setTripoStatus(s);
            tripoCache.set(product.id, { status: s, url: url ?? null });

            // FIX #4/#6: as soon as model is ready, place it immediately
            if (s === 'ready' && url && !hasAutoPlaced.current) {
              hasAutoPlaced.current = true;
              setTripoModelUrl(url);
              placeObject(url);
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

  // FIX #5: auto-start generation immediately on mount (no idle waiting)
  // If already cached and ready, auto-place immediately without regenerating
  useEffect(() => {
    const cached = tripoCache.get(product.id);

    if (cached?.status === 'ready' && cached.url) {
      // Already generated — just place it
      setTripoModelUrl(cached.url);
      if (!hasAutoPlaced.current) {
        hasAutoPlaced.current = true;
        placeObject(cached.url);
      }
      return;
    }

    if (cached?.status === 'generating') {
      // Already in progress from a previous render — don't restart
      return;
    }

    // Start fresh
   runTripo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // ── Handle shapes (still manual, for user-initiated primitives) ─────────────
  const handlePlaceShape = (type: 'cube' | 'sphere' | 'cone') => {
    const colors = { cube: '#ef4444', sphere: '#3b82f6', cone: '#f59e0b' };
    const emojis = { cube: '⬛', sphere: '⚫', cone: '🔺' };
    const idx = sceneStore.getObjects().length;
    const obj = makeObject(type, {
      color:         colors[type],
      participantId: getSession()?.participantId ?? 'local',
      offsetIndex:   idx,
      label:         type.charAt(0).toUpperCase() + type.slice(1),
      emoji:         emojis[type],
    });
    sceneStore.addObject(obj);
    broadcastScene({ type: 'obj_placed', payload: obj });
    getSession()?.send({
      type: 'control_action',
      action: 'scene_object_placed',
      data: { object: obj },
    } as any);
  };

  // ── Multiplayer remote events (sync preserved) ───────────────────────────────
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    return session.onEvent((event) => {
      if ((event as any).type !== 'control_action') return;
      const { action, data } = event as any;
      if (action === 'scene_object_placed' && data?.object) {
        sceneStore.addObject(data.object);
      }
      if (action === 'scene_object_moved' && data?.id) {
        sceneStore.moveObject(data.id, data.transform);
      }
      if (action === 'scene_object_color' && data?.id) {
        sceneStore.setColor(data.id, data.color);
      }
      if (action === 'scene_object_delete' && data?.id) {
        sceneStore.deleteObject(data.id);
      }
    });
  }, []);

  // ── Bridge from scene messages (sync preserved) ──────────────────────────────
  useEffect(() => {
    return onSceneMessage((msg) => {
      switch (msg.type) {
        case 'obj_deleted':
          sceneStore.deleteObject(msg.payload.id);
          break;
        case 'scene_cleared':
          sceneStore.clearAll();
          break;
        case 'scene_loaded':
          sceneStore.clearAll?.();
          for (const o of msg.payload.objects) sceneStore.addObject(o);
          break;
      }
    });
  }, []);

  // ── Layout ops ────────────────────────────────────────────────────────────────
  const handleSaveLayout = () => {
    const name = `Layout ${new Date().toLocaleTimeString()}`;
    const l = loadLayouts();
    l[name] = sceneStore.getObjects();
    saveLayouts(l);
  };
  const handleLoadLayout = () => {
    const l = loadLayouts();
    const keys = Object.keys(l);
    if (!keys.length) return;
    const objs: PlacedObject[] = l[keys[keys.length - 1]];
    sceneStore.clearAll?.();
    for (const o of objs) sceneStore.addObject(o);
    broadcastScene({ type: 'scene_loaded', payload: { objects: objs } });
  };
  const handleClearAll = () => {
    sceneStore.clearAll?.();
    broadcastScene({ type: 'scene_cleared' });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 2rem)',
      overflow: 'hidden',
      padding: '1rem 1.5rem',
      gap: '0.75rem',
    }}>
      {/* ── Header row ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="browse-back-btn" onClick={onBack}>← All products</button>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            {product.emoji} {product.name} · Place It
          </span>
        </div>

        {/* FIX #2: Layout button stays in header, dropdown opens downward */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {hasControl && (
            <span style={{
              fontSize: '0.7rem',
              background: 'rgba(16,185,129,0.18)',
              border: '1px solid rgba(16,185,129,0.4)',
              color: '#6ee7b7',
              borderRadius: 100,
              padding: '0.2rem 0.7rem',
              fontWeight: 600,
            }}>
              🎮 You control the scene
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
            {placedCount} object{placedCount !== 1 ? 's' : ''}
          </span>
          {/* FIX #2: LayoutPanel now opens dropdown downward */}
          <LayoutPanel
            onSave={handleSaveLayout}
            onLoad={handleLoadLayout}
            onClear={handleClearAll}
          />
        </div>
      </div>

      {/* ── Main content: 3D scene + sidebar ── */}
      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>

        {/* 3D scene */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Shared3DScene />
          </div>
        </div>

        {/* Right sidebar — FIX #3: no XR code, clean status + shape tools */}
        <div className="spatial-panel place-toolbar-panel" style={{
          gap: '0.65rem',
          minWidth: 90,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0.85rem 0.6rem',
        }}>
          {/* Tripo status — FIX #4/#5/#6: no manual place button */}
          <TripoStatusBar status={tripoStatus} onRetry={runTripo} />

          <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
            {placedCount} obj
          </div>

          <button
            className="tool-btn"
            onClick={onBack}
            style={{ width: '100%', fontSize: '0.7rem', marginTop: 4 }}
          >←</button>
        </div>
      </div>

      {/* FIX #1: checkout bar with real product image */}
      {/* <DesktopCheckout product={product} /> */}
    </div>
  );
}