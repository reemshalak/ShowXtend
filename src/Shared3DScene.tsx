/**
 * Shared3DScene — 3D placement scene (web only; XR handled by XRModelWindow).
 *
 * FIXES:
 * - Each object uses its own modelUrl (Tripo3D or fallback GLB).
 * - Loading spinner + "Retry" button when model fails.
 * - Objects survive navigation (sceneStore is a module singleton).
 * - All broadcastObject / session.send calls preserved so web↔XR stays in sync.
 */

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { isXRMode } from './xrMode';
import { sceneStore, type PlacedObject, type Transform3D } from './sceneStore';
import { getSession } from './collaboration';
import { broadcastObject, onSceneMessage } from './Xrwindowbridge';

import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, PivotControls, Html, ContactShadows } from '@react-three/drei';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FALLBACK_MODEL_URL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

const PALETTE = [
  '#c8b89a','#e5e7eb','#6b7280','#1c1c1c',
  '#ef4444','#f59e0b','#3b82f6','#10b981',
  '#7c3aed','#ec4899','#065f46','#b45309',
];

// ── Per-object model with loading + error + retry ─────────────────────────────
function ObjectModel({
  modelUrl, color, onRetry,
}: { modelUrl: string; color: string; onRetry?: () => void }) {
  const [url, setUrl]       = useState(modelUrl);
  const [failed, setFailed] = useState(false);
  const [key, setKey]       = useState(0); // force remount on retry

  const handleRetry = () => {
    setFailed(false);
    setUrl(modelUrl); // try Tripo URL again
    setKey(k => k + 1);
    onRetry?.();
  };

  if (failed) {
    return (
      <Html center>
        <div style={{
          background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 10, padding: '6px 12px', fontSize: '0.7rem',
          color: '#fca5a5', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <span>⚠ Load failed</span>
          <button onClick={handleRetry} style={{
            background: 'rgba(99,102,241,0.3)', border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: 6, color: '#c4b5fd', fontSize: '0.65rem', padding: '2px 8px', cursor: 'pointer',
          }}>Retry</button>
          <UseFallback color={color} />
        </div>
      </Html>
    );
  }

  return (
    <Suspense key={key} fallback={<LoadingMesh />}>
      <GltfMesh url={url} color={color} onError={() => setFailed(true)} />
    </Suspense>
  );
}

// Loader with error boundary pattern via useLoader + try/catch mesh
function GltfMesh({ url, color, onError }: { url: string; color: string; onError: () => void }) {
  const [errored, setErrored] = useState(false);

  useEffect(() => { setErrored(false); }, [url]);

  if (errored) { onError(); return null; }

  return (
    <ErrorBoundaryMesh url={url} color={color} onError={() => { setErrored(true); onError(); }} />
  );
}

function ErrorBoundaryMesh({ url, color, onError }: { url: string; color: string; onError: () => void }) {
  let gltf: any;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    gltf = useLoader(GLTFLoader, url);
  } catch {
    useEffect(() => { onError(); }, []);
    return null;
  }

  const scene = gltf?.scene?.clone?.();
  if (!scene) return null;

  // Apply color tint
  scene.traverse((child: any) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.color = new THREE.Color(color);
    }
  });

  return <primitive object={scene} scale={0.5} />;
}

function LoadingMesh() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 12, 12]} />
      <meshBasicMaterial color="#6b7280" wireframe />
    </mesh>
  );
}

function UseFallback({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// ── Color picker popover ────────────────────────────────────────────────────
function ColorPopover({ current, onPick, onClose }: {
  current: string; onPick: (c: string) => void; onClose: () => void;
}) {
  return (
    <div style={{
      position:'absolute', bottom:'calc(100% + 14px)', left:'50%', transform:'translateX(-50%)',
      background:'rgba(6,6,14,0.97)', backdropFilter:'blur(24px)',
      border:'1px solid rgba(255,255,255,0.15)', borderRadius:14,
      padding:'10px 12px 8px', zIndex:300, pointerEvents:'auto',
      boxShadow:'0 8px 40px rgba(0,0,0,0.75)', minWidth:160,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:'0.66rem', color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>Colour</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:'0.72rem', padding:0 }}>✕</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:5 }}>
        {PALETTE.map(c => (
          <button key={c} onClick={() => { onPick(c); onClose(); }} style={{
            width:22, height:22, borderRadius:'50%', background:c,
            border: c === current ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.18)',
            cursor:'pointer',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Circular toolbar (web) ──────────────────────────────────────────────────
function CircularToolbar({ object, onAction, onClose }: {
  object: PlacedObject; onAction: (a: string) => void; onClose: () => void;
}) {
  const [showColors, setShowColors] = useState(false);
  const BTNS = [
    { id:'rotate-left', icon:'↺',  angle:270, danger:false },
    { id:'color',       icon:'🎨', angle:330, danger:false },
    { id:'scale-up',    icon:'+',  angle:30,  danger:false },
    { id:'duplicate',   icon:'⧉',  angle:90,  danger:false },
    { id:'scale-down',  icon:'−',  angle:150, danger:false },
    { id:'delete',      icon:'🗑', angle:210, danger:true  },
  ];
  const R = 46;
  return (
    <div style={{ position:'relative', width:0, height:0, pointerEvents:'none' }}>
      {showColors && (
        <div style={{ position:'absolute', bottom:R+20, left:-80, pointerEvents:'auto', zIndex:300 }}>
          <ColorPopover current={object.color} onPick={c => onAction(`color:${c}`)} onClose={() => setShowColors(false)} />
        </div>
      )}
      <div style={{
        position:'absolute', left:-(R+18), top:-(R+18),
        width:(R+18)*2, height:(R+18)*2, borderRadius:'50%',
        background:'rgba(5,5,12,0.92)', backdropFilter:'blur(22px)',
        border:'1px solid rgba(255,255,255,0.13)',
        boxShadow:'0 6px 30px rgba(0,0,0,0.8)', pointerEvents:'auto',
      }} />
      <div style={{
        position:'absolute', bottom:-(R+26), left:'50%', transform:'translateX(-50%)',
        background:'rgba(5,5,12,0.88)', border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:8, padding:'3px 10px', fontSize:'0.66rem',
        color:'rgba(255,255,255,0.55)', whiteSpace:'nowrap', pointerEvents:'none',
      }}>
        {object.label ?? object.type}{' · '}<span style={{ color:object.color, fontWeight:700 }}>●</span>
      </div>
      <button onClick={onClose} style={{
        position:'absolute', left:-12, top:-12, width:24, height:24,
        borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.12)',
        color:'#fff', fontSize:'0.65rem', cursor:'pointer', zIndex:10,
        pointerEvents:'auto', display:'flex', alignItems:'center', justifyContent:'center',
      }}>✕</button>
      {BTNS.map(btn => {
        const rad = (btn.angle * Math.PI) / 180;
        const x = Math.cos(rad)*R-12, y = Math.sin(rad)*R-12;
        const isActive = btn.id === 'color' && showColors;
        return (
          <button key={btn.id} title={btn.id} onClick={() => {
            if (btn.id === 'color') { setShowColors(v => !v); return; }
            onAction(btn.id);
          }} style={{
            position:'absolute', left:x, top:y, width:24, height:24, borderRadius:'50%',
            border:`1px solid ${btn.danger ? 'rgba(239,68,68,0.5)' : isActive ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.2)'}`,
            background: btn.danger ? 'rgba(239,68,68,0.2)' : isActive ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.1)',
            color: btn.danger ? '#fca5a5' : '#fff', fontSize:'0.7rem',
            cursor:'pointer', pointerEvents:'auto',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>{btn.icon}</button>
        );
      })}
    </div>
  );
}

// ── Per-object mesh in the Three.js scene ────────────────────────────────────
function WebMesh({ object, selected, onSelect, onMoveEnd }: {
  object: PlacedObject; selected: boolean;
  onSelect: () => void; onMoveEnd: (t: Transform3D) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const matRef = useRef(new THREE.Matrix4());
  const { position:p, rotation:r, scale:s } = object.transform;
  const modelUrl = object.modelUrl ?? FALLBACK_MODEL_URL;

  return (
    <PivotControls visible={selected} depthTest={false} anchor={[0,-0.5,0]} scale={0.6}
      onDrag={(m: THREE.Matrix4) => { matRef.current = m.clone(); }}
      onDragEnd={() => {
        const pos=new THREE.Vector3(), rot=new THREE.Euler(), sc=new THREE.Vector3(), q=new THREE.Quaternion();
        matRef.current.decompose(pos,q,sc); rot.setFromQuaternion(q);
        onMoveEnd({ position:{x:pos.x,y:pos.y,z:pos.z}, rotation:{x:rot.x,y:rot.y,z:rot.z}, scale:{x:sc.x,y:sc.y,z:sc.z} });
      }}>
      <group
        position={[p.x, p.y, p.z]}
        rotation={[r.x, r.y, r.z]}
        scale={[s.x, s.y, s.z]}
        onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        {(selected || hovered) && (
          <mesh scale={[1.2,1.2,1.2]}>
            <sphereGeometry args={[0.5,16,16]} />
            <meshBasicMaterial color={selected ? '#fff' : object.color} transparent opacity={0.2} wireframe />
          </mesh>
        )}
        <ObjectModel modelUrl={modelUrl} color={object.color} />
        <Html center distanceFactor={6} style={{
          pointerEvents:'none', userSelect:'none', fontSize:'0.75rem', lineHeight:1,
          marginTop:'-1.8rem', background:'rgba(0,0,0,0.5)', padding:'2px 6px',
          borderRadius:12, whiteSpace:'nowrap',
        }}>
          {object.emoji} {object.label}
        </Html>
      </group>
    </PivotControls>
  );
}

// ── WebScene ─────────────────────────────────────────────────────────────────
function WebScene({ objects, selectedId, onSelect, onMoveEnd }: {
  objects: PlacedObject[]; selectedId: string|null;
  onSelect: (id:string|null) => void; onMoveEnd: (id:string, t:Transform3D) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[6,12,6]} intensity={1.4} castShadow />
      <ContactShadows position={[0,-0.01,0]} opacity={0.35} scale={10} blur={2.5} far={4} />
      <gridHelper args={[10,20,'#1a1a2e','#1a1a2e']} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} minPolarAngle={0} maxPolarAngle={Math.PI/2.05} />
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.01,0]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[30,30]} />
        <meshStandardMaterial color="#080810" transparent opacity={0.6} />
      </mesh>
      {objects.map(o => (
        <WebMesh key={o.id} object={o} selected={selectedId===o.id}
          onSelect={() => onSelect(o.id)}
          onMoveEnd={t => onMoveEnd(o.id, t)} />
      ))}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Shared3DScene() {
  const [objects, setObjects]     = useState<PlacedObject[]>(() => sceneStore.getObjects());
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera|null>(null);
  const [toolbarPos, setToolbarPos] = useState<{x:number;y:number}|null>(null);

  useEffect(() => sceneStore.subscribe(setObjects), []);

  // React to XRModelWindow bridge messages — keep all broadcasts
  useEffect(() => {
    return onSceneMessage((msg) => {
      switch (msg.type) {
        case 'obj_deleted':
          sceneStore.deleteObject(msg.payload.id);
          if (selectedId === msg.payload.id) setSelectedId(null);
          break;
        case 'obj_selected':
          setSelectedId(msg.payload.id);
          break;
        case 'scene_cleared':
          sceneStore.clearAll?.();
          setSelectedId(null);
          break;
        case 'scene_loaded':
          sceneStore.clearAll?.();
          for (const o of msg.payload.objects) sceneStore.addObject(o);
          setSelectedId(null);
          break;
      }
    });
  }, [selectedId]);

  const selectedObj = objects.find(o => o.id === selectedId) ?? null;

  // Toolbar screen-space position
  useEffect(() => {
    if (!selectedObj || !cameraRef.current || !containerRef.current) { setToolbarPos(null); return; }
    const cam  = cameraRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    const v    = new THREE.Vector3(
      selectedObj.transform.position.x,
      selectedObj.transform.position.y + 0.9,
      selectedObj.transform.position.z
    );
    v.project(cam);
    setToolbarPos({ x:(v.x*0.5+0.5)*rect.width, y:(-v.y*0.5+0.5)*rect.height });
  }, [selectedId, objects]);

  const handleMoveEnd = useCallback((id: string, t: Transform3D) => {
    sceneStore.moveObject(id, t);
    if (id === selectedId && cameraRef.current && containerRef.current) {
      const cam  = cameraRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const v    = new THREE.Vector3(t.position.x, t.position.y+0.9, t.position.z);
      v.project(cam);
      setToolbarPos({ x:(v.x*0.5+0.5)*rect.width, y:(-v.y*0.5+0.5)*rect.height });
    }
    broadcastObject(id, { type:'move', payload:{ transform:t } });
    getSession()?.send({ type:'control_action', action:'scene_object_moved', data:{ id, transform:t } } as any);
  }, [selectedId]);

  const handleToolbarAction = useCallback((action: string) => {
    if (!selectedId) return;
    const obj = sceneStore.getObjects().find(o => o.id === selectedId);
    if (!obj) return;

    if (action.startsWith('color:')) {
      const color = action.slice(6);
      sceneStore.setColor(selectedId, color);
      broadcastObject(selectedId, { type:'color', payload:{ color } });
      getSession()?.send({ type:'control_action', action:'scene_object_color', data:{ id:selectedId, color } } as any);
      return;
    }

    switch (action) {
      case 'duplicate':
        sceneStore.duplicateObject(selectedId);
        { const objs = sceneStore.getObjects(); broadcastObject(selectedId, { type:'duplicate' }); getSession()?.send({ type:'control_action', action:'scene_object_duplicate', data:{ id:selectedId } } as any); }
        break;
      case 'delete':
        sceneStore.deleteObject(selectedId);
        broadcastObject(selectedId, { type:'delete' });
        getSession()?.send({ type:'control_action', action:'scene_object_delete', data:{ id:selectedId } } as any);
        setSelectedId(null);
        break;
      case 'scale-up': {
        const next = Math.min(4, parseFloat((obj.transform.scale.x+0.15).toFixed(2)));
        const newT = { ...obj.transform, scale:{ x:next,y:next,z:next } };
        sceneStore.moveObject(selectedId, newT);
        broadcastObject(selectedId, { type:'scale', payload:{ scale:next } });
        getSession()?.send({ type:'control_action', action:'scene_object_moved', data:{ id:selectedId, transform:newT } } as any);
        break;
      }
      case 'scale-down': {
        const next = Math.max(0.1, parseFloat((obj.transform.scale.x-0.15).toFixed(2)));
        const newT = { ...obj.transform, scale:{ x:next,y:next,z:next } };
        sceneStore.moveObject(selectedId, newT);
        broadcastObject(selectedId, { type:'scale', payload:{ scale:next } });
        getSession()?.send({ type:'control_action', action:'scene_object_moved', data:{ id:selectedId, transform:newT } } as any);
        break;
      }
      case 'rotate-left': {
        const newT = { ...obj.transform, rotation:{ ...obj.transform.rotation, y:obj.transform.rotation.y-Math.PI/4 } };
        sceneStore.moveObject(selectedId, newT);
        broadcastObject(selectedId, { type:'rotate', payload:{ deltaY:-Math.PI/4 } });
        getSession()?.send({ type:'control_action', action:'scene_object_moved', data:{ id:selectedId, transform:newT } } as any);
        break;
      }
      case 'rotate-right': {
        const newT = { ...obj.transform, rotation:{ ...obj.transform.rotation, y:obj.transform.rotation.y+Math.PI/4 } };
        sceneStore.moveObject(selectedId, newT);
        broadcastObject(selectedId, { type:'rotate', payload:{ deltaY:Math.PI/4 } });
        getSession()?.send({ type:'control_action', action:'scene_object_moved', data:{ id:selectedId, transform:newT } } as any);
        break;
      }
    }
  }, [selectedId]);

  const onCreated = useCallback(({ camera }: { camera: THREE.Camera }) => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
  }, []);

  // XR: handled by XRModelWindow — just show placeholder
  if (isXRMode) {
    return (
      <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(255,255,255,0.03)', borderRadius:16, border:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'0.72rem', lineHeight:2 }}>
          <div style={{ fontSize:'1.5rem', marginBottom:4 }}>🪑</div>
          {objects.length === 0 ? 'Objects appear as floating windows' : `${objects.length} object${objects.length!==1?'s':''} in your space`}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width:'100%', height:'100%', position:'relative', background:'#07070d', borderRadius:16, overflow:'hidden' }}>
      <Canvas shadows camera={{ position:[4,4.5,4], fov:44 }} style={{ borderRadius:16 }} onCreated={onCreated}>
        <WebScene objects={objects} selectedId={selectedId} onSelect={setSelectedId} onMoveEnd={handleMoveEnd} />
      </Canvas>

      {selectedObj && toolbarPos && (
        <div style={{ position:'absolute', left:toolbarPos.x, top:toolbarPos.y, transform:'translate(-50%,-50%)', zIndex:60, pointerEvents:'none' }}>
          <CircularToolbar object={selectedObj} onAction={handleToolbarAction} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {objects.length === 0 && (
        <div style={{ position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
          background:'rgba(255,255,255,0.07)', backdropFilter:'blur(8px)', padding:'5px 14px',
          borderRadius:20, color:'rgba(255,255,255,0.45)', fontSize:'0.7rem', pointerEvents:'none',
          border:'1px solid rgba(255,255,255,0.08)' }}>
          Click "Place It" to add furniture
        </div>
      )}
    </div>
  );
}