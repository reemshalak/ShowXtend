/**
 * sceneStore.ts — Module-level singleton for placed 3D objects.
 *
 * Lives OUTSIDE React so objects survive mode changes (browse ↔ catalog ↔ place-it).
 * React components subscribe via subscribe() and get notified on every change.
 *
 * Also handles:
 *   - Save / load / delete named layouts (localStorage)
 *   - Wishlist persistence (localStorage)
 *   - Cart persistence (localStorage)
 */

import type { Product } from './data';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Transform3D {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale:    { x: number; y: number; z: number };
}

export interface PlacedObject {
  id:        string;
  type:      'product' | 'cube' | 'sphere' | 'cone';
  productId?: number;
  emoji?:    string;
  label?:    string;
  transform: Transform3D;
  color:     string;
  placedBy:  string;
  placedAt:  number;
  modelUrl?: string | null;  // ← ADD THIS - for Tripo3D generated models
}

export interface SavedLayout {
  id:        string;
  name:      string;
  objects:   PlacedObject[];
  createdAt: number;
}

export interface CartItem { product: Product; qty: number; }

// ── Scene store ───────────────────────────────────────────────────────────────

type SceneListener = (objects: PlacedObject[]) => void;

let _objects: PlacedObject[] = [];
const _listeners = new Set<SceneListener>();

function notify() { _listeners.forEach(l => l([..._objects])); }

export const sceneStore = {
  getObjects: () => [..._objects],

  addObject(obj: PlacedObject) {
    _objects.push(obj);
    notify();
  },

  updateObject(id: string, patch: Partial<PlacedObject>) {
    _objects = _objects.map(o => o.id === id ? { ...o, ...patch } : o);
    notify();
  },

  moveObject(id: string, transform: Transform3D) {
    _objects = _objects.map(o => o.id === id ? { ...o, transform } : o);
    notify();
  },

  setColor(id: string, color: string) {
    _objects = _objects.map(o => o.id === id ? { ...o, color } : o);
    notify();
  },

  deleteObject(id: string) {
    _objects = _objects.filter(o => o.id !== id);
    notify();
  },

  duplicateObject(id: string) {
    const src = _objects.find(o => o.id === id);
    if (!src) return;
    const clone: PlacedObject = {
      ...src,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      placedAt: Date.now(),
      modelUrl: src.modelUrl,  // ← COPY modelUrl to clone
      transform: {
        ...src.transform,
        position: {
          x: src.transform.position.x + 0.6,
          y: src.transform.position.y,
          z: src.transform.position.z,
        },
      },
    };
    _objects.push(clone);
    notify();
  },

  clearAll() { _objects = []; notify(); },

  subscribe(cb: SceneListener): () => void {
    _listeners.add(cb);
    cb([..._objects]); // immediate call with current state
    return () => _listeners.delete(cb);
  },

  // ── Layout persistence ────────────────────────────────────────────────────

  saveLayout(name: string): string {
    const id = `layout-${Date.now()}`;
    const layout: SavedLayout = {
      id, name,
      objects: [..._objects],
      createdAt: Date.now(),
    };
    const all = sceneStore.getLayouts();
    all.push(layout);
    localStorage.setItem('showxhome-layouts', JSON.stringify(all));
    return id;
  },

  getLayouts(): SavedLayout[] {
    try { return JSON.parse(localStorage.getItem('showxhome-layouts') ?? '[]'); } catch { return []; }
  },

  loadLayout(id: string) {
    const layout = sceneStore.getLayouts().find(l => l.id === id);
    if (!layout) return;
    _objects = layout.objects.map(o => ({ ...o }));
    notify();
  },

  deleteLayout(id: string) {
    const all = sceneStore.getLayouts().filter(l => l.id !== id);
    localStorage.setItem('showxhome-layouts', JSON.stringify(all));
  },

  // ── Wishlist persistence ──────────────────────────────────────────────────

  getWishlist(): number[] {
    try { return JSON.parse(localStorage.getItem('showxhome-wishlist') ?? '[]'); } catch { return []; }
  },
  saveWishlist(ids: number[]) {
    localStorage.setItem('showxhome-wishlist', JSON.stringify(ids));
  },

  // ── Cart persistence ──────────────────────────────────────────────────────

  getCart(): { productId: number; qty: number }[] {
    try { return JSON.parse(localStorage.getItem('showxhome-cart') ?? '[]'); } catch { return []; }
  },
  saveCart(items: { productId: number; qty: number }[]) {
    localStorage.setItem('showxhome-cart', JSON.stringify(items));
  },
};

// ── Helper to create a new PlacedObject ──────────────────────────────────────

export function makeObject(
  type: PlacedObject['type'],
  opts: { 
    productId?: number; 
    emoji?: string; 
    label?: string; 
    color?: string; 
    participantId?: string; 
    offsetIndex?: number;
    modelUrl?: string | null;  // ← ADD THIS
  }
): PlacedObject {
  const idx = opts.offsetIndex ?? 0;
  return {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    productId: opts.productId,
    emoji:     opts.emoji,
    label:     opts.label,
    color:     opts.color ?? '#c8b89a',
    placedBy:  opts.participantId ?? 'local',
    placedAt:  Date.now(),
    modelUrl:  opts.modelUrl ?? null,  // ← ADD THIS
    transform: {
      position: { x: (idx % 3) * 1.2 - 1.2, y: 0, z: Math.floor(idx / 3) * -1.2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale:    { x: 1, y: 1, z: 1 },
    },
  };
}