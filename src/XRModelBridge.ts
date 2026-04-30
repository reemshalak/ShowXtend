/**
 * XRModelBridge — shared protocol for cross-window XR communication.
 *
 * PROBLEM THIS SOLVES (PICO → Web control broken):
 * On PICO each window.open() is a separate JS context. getSession() returns null
 * in child windows because joinSession() ran in the main window's context.
 * Fix: child windows post 'up' messages on MODEL_BUS → PlaceItView (main window,
 * which HAS the session) receives them and relays to Supabase → web peers get it.
 *
 * CHANNELS:
 *   MODEL_BUS ('xr-model-bus') — child ↔ main window for session relay
 *   toolbarChannel(id)         — XRModelWindow ↔ XRObjectToolbarWindow per object
 */

export const MODEL_BUS = 'xr-model-bus';
export const toolbarChannel = (id: string) => `xr-toolbar-${id}`;

export type BusMsg =
  | { dir: 'up';   type: 'placed';    object: SerializedObj }
  | { dir: 'up';   type: 'color';     id: string; color: string }
  | { dir: 'up';   type: 'scale';     id: string; scale: number }
  | { dir: 'up';   type: 'duplicate'; id: string }
  | { dir: 'up';   type: 'deleted';   id: string }
  | { dir: 'down'; type: 'color';     id: string; color: string }
  | { dir: 'down'; type: 'scale';     id: string; scale: number }
  | { dir: 'down'; type: 'deleted';   id: string }
  | { dir: 'down'; type: 'model_url'; id: string; url: string };

export type ToolbarMsg =
  | { type: 'color';     color: string }
  | { type: 'scale';     delta: number }
  | { type: 'duplicate' }
  | { type: 'delete' }
  | { type: 'close' }
  | { type: 'state'; color: string; scale: number; emoji: string; label: string };

export interface SerializedObj {
  id:        string;
  type:      string;
  emoji:     string;
  label:     string;
  color:     string;
  scale:     number;
  modelUrl?: string;
  transform: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale:    { x: number; y: number; z: number };
  };
}

export const FALLBACK_MODELS: Record<string, string> = {
  product: 'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
  cube:    'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
  sphere:  'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
  cone:    'https://developer.apple.com/augmented-reality/quick-look/models/teapot/teapot.usdz',
};

export function postBus(msg: BusMsg) {
  try { const ch = new BroadcastChannel(MODEL_BUS); ch.postMessage(msg); ch.close(); } catch {}
}
export function postToolbar(id: string, msg: ToolbarMsg) {
  try { const ch = new BroadcastChannel(toolbarChannel(id)); ch.postMessage(msg); ch.close(); } catch {}
}
export function onBus(handler: (msg: BusMsg) => void): () => void {
  try { const ch = new BroadcastChannel(MODEL_BUS); ch.onmessage = e => handler(e.data); return () => ch.close(); }
  catch { return () => {}; }
}
export function onToolbar(id: string, handler: (msg: ToolbarMsg) => void): () => void {
  try { const ch = new BroadcastChannel(toolbarChannel(id)); ch.onmessage = e => handler(e.data); return () => ch.close(); }
  catch { return () => {}; }
}
