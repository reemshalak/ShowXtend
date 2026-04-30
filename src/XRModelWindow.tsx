import { useEffect, useRef, useState } from 'react';
import { 
  Reality, 
  SceneGraph, 
  ModelAsset, 
  ModelEntity,
  UnlitMaterial 
} from '@webspatial/react-sdk';
import type { PlacedObject, Transform3D } from './sceneStore';
import { sceneStore } from './sceneStore';
import { onObjectMessage, broadcastObject, broadcastScene, type ObjectMsg } from './Xrwindowbridge';
import { getSession } from './collaboration';

//@ts-ignore
import './css/XRModelWindow.css';

const PALETTE = [
  '#c8b89a','#e5e7eb','#6b7280','#1c1c1c',
  '#ef4444','#f59e0b','#3b82f6','#10b981',
  '#7c3aed','#ec4899','#065f46','#b45309',
];

const FALLBACK: Record<string, string> = {
  product: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
};

function ColorPopover({ current, onPick, onClose }: any) {
  return (
    <div className="xrm-color-popover">
      <div className="xrm-color-popover-header">
        <span className="xrm-color-popover-title">Colour</span>
        <button onClick={onClose} className="xrm-color-popover-close">✕</button>
      </div>
      <div className="xrm-color-grid">
        {PALETTE.map((c: string) => (
          <button
            key={c}
            onClick={() => { onPick(c); onClose(); }}
            className={`xrm-color-swatch ${c === current ? 'xrm-color-swatch-active' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function CircularToolbar({ obj, onAction, onClose }: any) {
  const [showColors, setShowColors] = useState(false);
  const BTNS = [
    { id: 'rotate-left', icon: '↺', angle: 270 },
    { id: 'color',       icon: '🎨', angle: 330 },
    { id: 'scale-up',    icon: '+',  angle: 30 },
    { id: 'duplicate',   icon: '⧉',  angle: 90 },
    { id: 'scale-down',  icon: '−',  angle: 150 },
    { id: 'delete',      icon: '🗑', angle: 210, danger: true },
  ];
  const R = 65;

  return (
    <div className="xrm-toolbar-container">
      <div className="xrm-toolbar-background" />
      <div className="xrm-toolbar-label">
        <span className="xrm-toolbar-label-color" style={{ color: obj.color }}>●</span>
        {obj.label ?? obj.type}
        <span className="xrm-toolbar-label-percent">
          {(obj.transform.scale.x * 100).toFixed(0)}%
        </span>
      </div>
      <button onClick={onClose} className="xrm-toolbar-close">✕</button>
      {showColors && (
        <div className="xrm-toolbar-color-popout">
          <ColorPopover
            current={obj.color}
            onPick={(c: string) => onAction(`color:${c}`)}
            onClose={() => setShowColors(false)}
          />
        </div>
      )}
      {BTNS.map((btn: any) => {
        const rad = (btn.angle * Math.PI) / 180;
        const bx = Math.cos(rad) * R;
        const by = Math.sin(rad) * R;
        const isActive = btn.id === 'color' && showColors;

        let btnClass = 'xrm-toolbar-btn';
        if (btn.danger) btnClass += ' xrm-toolbar-btn-danger';
        else if (isActive) btnClass += ' xrm-toolbar-btn-active';
        else btnClass += ' xrm-toolbar-btn-default';

        return (
          <button
            key={btn.id}
            className={btnClass}
            style={{ left: bx - 17, top: by - 17 }}
            onClick={() => {
              if (btn.id === 'color') { setShowColors(v => !v); return; }
              onAction(btn.id);
            }}
          >
            {btn.icon}
          </button>
        );
      })}
    </div>
  );
}

// ── Progress dots animation ───────────────────────────────────────────────────
function GeneratingUI({ emoji, stage }: { emoji: string; stage: 'waiting' | 'generating' }) {
  const [dots, setDots] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const label = stage === 'waiting' ? 'Preparing…' : 'Generating 3D model';
  const dotStr = '.'.repeat(dots);
  const pct = Math.min(95, (elapsed / 75) * 100);

  return (
    <div className="xrm-generating-container">
      <div className="xrm-generating-emoji">{emoji || '📦'}</div>
      <div className="xrm-generating-label">{label}{dotStr}</div>
      <div className="xrm-progress-bar-container">
        <div className="xrm-progress-bar-fill" style={{ width: `${pct}%` }} />
        <div className="xrm-progress-bar-shimmer" />
      </div>
      <div className="xrm-generating-time">
        {elapsed < 5
          ? 'Starting up…'
          : elapsed < 70
            ? `~${Math.max(5, 75 - elapsed)}s remaining`
            : 'Almost there…'}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function XRModelWindow() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get('data');
  const modelUrlParam = params.get('modelUrl');

  const [obj, setObj] = useState<PlacedObject | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(modelUrlParam);
  
  // Store current transform for Reality
  const [transform, setTransform] = useState({ 
    scale: 1.0, 
    rotation: 0,
    position: { x: 0, y: 0, z: 0 }
  });

  type MS = 'waiting' | 'generating' | 'ready' | 'error';
  const [modelState, setModelState] = useState<MS>(modelUrlParam ? 'ready' : 'waiting');

  // Update transform when obj changes
  useEffect(() => {
    if (obj) {
      setTransform({
        scale: obj.transform.scale.x *0.15, // 🔥 Increased scale for visibility
        rotation: obj.transform.rotation.y,
        position: { x: 0, y: 0, z: 0.5 }
      });
    }
  }, [obj?.transform.scale.x, obj?.transform.rotation.y]);

  useEffect(() => {
    if (modelState !== 'waiting' && modelState !== 'generating') return;
    const timeout = setTimeout(() => {
      if (modelState === 'waiting' || modelState === 'generating') {
        console.warn('[XRModelWindow] Timeout waiting for model');
        setModelState('error');
        setResolvedUrl(FALLBACK.product);
      }
    }, 120000);
    return () => clearTimeout(timeout);
  }, [modelState]);

  useEffect(() => {
    if (!dataParam) return;
    try { setObj(JSON.parse(decodeURIComponent(dataParam))); }
    catch (e) { console.error('[XRModelWindow] bad data', e); }
  }, []);

  useEffect(() => {
    if (!obj) return;
    return onObjectMessage(obj.id, (msg: ObjectMsg) => {
      switch (msg.type) {
        case 'model_loading':
          setModelState('generating');
          break;
        case 'model_ready':
          setResolvedUrl(msg.payload.url);
          setModelState('ready');
          setModelLoaded(false);
          break;
        case 'model_error':
          setModelState('error');
          setResolvedUrl(FALLBACK[obj?.type ?? 'product'] ?? FALLBACK.product);
          break;
        case 'delete': window.close(); break;
        case 'select': setShowToolbar(msg.payload.selected); break;
        case 'sync': setObj(msg.payload); break;
        case 'color': setObj(prev => prev ? { ...prev, color: msg.payload.color } : prev); break;
        case 'scale': setObj(prev => {
          if (!prev) return prev;
          const s = msg.payload.scale;
          setTransform(t => ({ ...t, scale: s * 1.5 }));
          return { ...prev, transform: { ...prev.transform, scale: { x: s, y: s, z: s } } };
        }); break;
        case 'rotate': setObj(prev => {
          if (!prev) return prev;
          const r = prev.transform.rotation;
          setTransform(t => ({ ...t, rotation: r.y + msg.payload.deltaY }));
          return { ...prev, transform: { ...prev.transform, rotation: { ...r, y: r.y + msg.payload.deltaY } } };
        }); break;
        case 'move': setObj(prev => prev ? { ...prev, transform: msg.payload.transform } : prev); break;
      }
    });
  }, [obj?.id]);

  const commit = (newT: Transform3D) => {
    if (!obj) return;
    setObj(prev => prev ? { ...prev, transform: newT } : prev);
    sceneStore.moveObject(obj.id, newT);
    broadcastObject(obj.id, { type: 'move', payload: { transform: newT } });
    getSession()?.send({ type: 'control_action', action: 'scene_object_moved', data: { id: obj.id, transform: newT } } as any);
  };

  const handleAction = (action: string) => {
    if (!obj) return;
    if (action.startsWith('color:')) {
      const color = action.slice(6);
      setObj(prev => prev ? { ...prev, color } : prev);
      sceneStore.setColor(obj.id, color);
      broadcastObject(obj.id, { type: 'color', payload: { color } });
      getSession()?.send({ type: 'control_action', action: 'scene_object_color', data: { id: obj.id, color } } as any);
      setShowToolbar(false);
      return;
    }
    switch (action) {
      case 'scale-up': {
        const next = Math.min(4, obj.transform.scale.x + 0.2);
        setTransform(t => ({ ...t, scale: next * 1.5 }));
        commit({ ...obj.transform, scale: { x: next, y: next, z: next } });
        broadcastObject(obj.id, { type: 'scale', payload: { scale: next } });
        break;
      }
      case 'scale-down': {
        const next = Math.max(0.2, obj.transform.scale.x - 0.2);
        setTransform(t => ({ ...t, scale: next * 1.5 }));
        commit({ ...obj.transform, scale: { x: next, y: next, z: next } });
        broadcastObject(obj.id, { type: 'scale', payload: { scale: next } });
        break;
      }
      case 'rotate-left': {
        const newRot = obj.transform.rotation.y - Math.PI / 4;
        setTransform(t => ({ ...t, rotation: newRot }));
        commit({ ...obj.transform, rotation: { ...obj.transform.rotation, y: newRot } });
        broadcastObject(obj.id, { type: 'rotate', payload: { deltaY: -Math.PI / 4 } });
        break;
      }
      case 'rotate-right': {
        const newRot = obj.transform.rotation.y + Math.PI / 4;
        setTransform(t => ({ ...t, rotation: newRot }));
        commit({ ...obj.transform, rotation: { ...obj.transform.rotation, y: newRot } });
        broadcastObject(obj.id, { type: 'rotate', payload: { deltaY: Math.PI / 4 } });
        break;
      }
      case 'duplicate': {
        sceneStore.duplicateObject(obj.id);
        const objects = sceneStore.getObjects();
        broadcastScene({ type: 'obj_placed', payload: objects[objects.length - 1]! });
        getSession()?.send({ type: 'control_action', action: 'scene_object_duplicate', data: { id: obj.id } } as any);
        break;
      }
      case 'delete':
        sceneStore.deleteObject(obj.id);
        broadcastScene({ type: 'obj_deleted', payload: { id: obj.id } });
        broadcastObject(obj.id, { type: 'delete' });
        getSession()?.send({ type: 'control_action', action: 'scene_object_delete', data: { id: obj.id } } as any);
        window.close();
        return;
    }
    setShowToolbar(false);
  };

  if (!obj) {
    return (
      <div enable-xr className="xrmw-init-container">
        <div className="xrmw-init-text">Initializing…</div>
      </div>
    );
  }

  if (modelState === 'waiting' || modelState === 'generating') {
    return (
      <div enable-xr style={{ width: '100%', height: '100%', background: 'transparent' }}>
        <GeneratingUI emoji={obj.emoji || '📦'} stage={modelState} />
      </div>
    );
  }

  const modelId = `model-${obj.id}`;

  return (
    <div enable-xr className="xrmw-ready-container">
      {/* Reality component with full 3D scene control */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <Reality
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 24,
          }}
        >
          {/* Material for color tinting */}
          <UnlitMaterial id="productMaterial" color={obj.color} />
          
          {/* Asset loading */}
          {resolvedUrl && (
            <ModelAsset
              id={modelId}
              src={resolvedUrl}
              onLoad={() => {
                console.log('[XRModelWindow] Model loaded:', resolvedUrl);
                setModelLoaded(true);
              }}
              onError={(err) => {
                console.error('[XRModelWindow] Model error:', err);
                setModelLoaded(true);
              }}
            />
          )}
          
          {/* Scene graph with positioned model */}
          <SceneGraph>
            {resolvedUrl && (
             <ModelEntity
  model={modelId}
  materials={["productMaterial"]}  // 🔥 Changed from 'material' to 'materials' (array)
  position={{ x: transform.position.x, y: transform.position.y, z: transform.position.z }}
  scale={{ x: transform.scale, y: transform.scale, z: transform.scale }}
  rotation={{ x: 0, y: 0, z: 30 }}
  onSpatialTap={() => {
    console.log('[XRModelWindow] Model tapped');
    setShowToolbar(true);
    broadcastScene({ type: 'obj_selected', payload: { id: obj.id } });
  }}
/>
            )}
          </SceneGraph>
        </Reality>
      </div>

      {resolvedUrl && !modelLoaded && (
        <div className="xrmw-loading-overlay">
          <div className="xrmw-loading-emoji">{obj.emoji || '📦'}</div>
          <div className="xrmw-loading-text">Downloading model…</div>
        </div>
      )}

      {modelState === 'error' && modelLoaded && (
        <div className="xrmw-error-badge">
          ⚠ Generation failed — showing fallback
        </div>
      )}

      {showToolbar && (
        <div
          className="xrmw-selection-ring"
          style={{ border: `2px solid ${obj.color}`, boxShadow: `0 0 18px ${obj.color}66` }}
        />
      )}

      {modelLoaded && !showToolbar && modelState !== 'error' && (
        <div className="xrmw-hint">
          {obj.emoji} {obj.label} · tap for controls
        </div>
      )}

      {showToolbar && (
        <div enable-xr className="xrmw-toolbar-wrapper">
          <CircularToolbar
            obj={obj}
            onAction={handleAction}
            onClose={() => {
              setShowToolbar(false);
              broadcastScene({ type: 'obj_selected', payload: { id: null } });
            }}
          />
        </div>
      )}
    </div>
  );
}