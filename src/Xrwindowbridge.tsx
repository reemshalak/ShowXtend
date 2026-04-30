/**
 * xrWindowBridge.ts
 *
 * Thin BroadcastChannel layer so that the web Shared3DScene, XR PlaceItView,
 * and individual XRModelWindow instances can all talk to each other with
 * zero coupling beyond this file.
 *
 * Channel naming:
 *   "xr-scene"          → global scene-level messages (place, delete, select…)
 *   "xr-obj-<id>"       → per-object messages (color, scale, rotate, move, delete)
 *
 * Every message is { type, payload }.
 */

// ── Message types ──────────────────────────────────────────────────────────

export type SceneMsg =
  | { type: 'obj_placed';    payload: import('./sceneStore').PlacedObject }
  | { type: 'obj_deleted';   payload: { id: string } }
  | { type: 'obj_selected';  payload: { id: string | null } }
  | { type: 'scene_cleared' }
  | { type: 'scene_loaded';  payload: { objects: import('./sceneStore').PlacedObject[] } };

export type ObjectMsg =
  | { type: 'color';    payload: { color: string } }
  | { type: 'scale';    payload: { scale: number } }        // absolute multiplier
  | { type: 'rotate';   payload: { deltaY: number } }       // radians
  | { type: 'move';     payload: { transform: import('./sceneStore').Transform3D } }
  | { type: 'delete' }
  | { type: 'select';   payload: { selected: boolean } }
  | { type: 'duplicate' }
  | { type: 'sync';     payload: import('./sceneStore').PlacedObject }
  | { type: 'model_loading' }
  | { type: 'model_ready';   payload: { url: string } }
  | { type: 'model_error' };  // full object state push

// ── Scene channel (singleton) ─────────────────────────────────────────────

let _sceneChannel: BroadcastChannel | null = null;

function getSceneChannel(): BroadcastChannel {
  if (!_sceneChannel) _sceneChannel = new BroadcastChannel('xr-scene');
  return _sceneChannel;
}

export function broadcastScene(msg: SceneMsg) {
  try { getSceneChannel().postMessage(msg); } catch {}
}

export function onSceneMessage(handler: (msg: SceneMsg) => void): () => void {
  const ch = getSceneChannel();
  const listener = (e: MessageEvent) => handler(e.data as SceneMsg);
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}

// ── Per-object channel ────────────────────────────────────────────────────

export function getObjectChannel(id: string): BroadcastChannel {
  return new BroadcastChannel(`xr-obj-${id}`);
}

export function broadcastObject(id: string, msg: ObjectMsg) {
  try {
    const ch = new BroadcastChannel(`xr-obj-${id}`);
    ch.postMessage(msg);
    ch.close();
  } catch {}
}

export function onObjectMessage(
  id: string,
  handler: (msg: ObjectMsg) => void,
): () => void {
  const ch = new BroadcastChannel(`xr-obj-${id}`);
  const listener = (e: MessageEvent) => handler(e.data as ObjectMsg);
  ch.addEventListener('message', listener);
  return () => { ch.removeEventListener('message', listener); ch.close(); };
}