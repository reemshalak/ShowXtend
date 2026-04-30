import { getSession, type SharedObject3D, type Transform3D } from './collaboration';

export class SharedSceneManager {
  private objects = new Map<string, SharedObject3D>();
  private session = getSession();
  private listeners: ((objects: SharedObject3D[]) => void)[] = [];

  constructor() {
    if (!this.session) return;

    this.session.onEvent((event, fromId) => {
      switch (event.type) {
        case 'object_placed':
          this.objects.set(event.object.id, event.object);
          this.notifyListeners();
          break;
        case 'object_moved':
          const obj = this.objects.get(event.objectId);
          if (obj) {
            obj.transform = event.transform;
            this.notifyListeners();
          }
          break;
        case 'object_deleted':
          this.objects.delete(event.objectId);
          this.notifyListeners();
          break;
        case 'request_object_sync':
          this.objects.forEach(obj => {
            this.session?.send({ type: 'object_placed', object: obj });
          });
          break;
      }
    });
  }

  placeObject(object: Omit<SharedObject3D, 'id' | 'placedAt' | 'placedBy'>) {
    const newObject: SharedObject3D = {
      ...object,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      placedBy: this.session?.participantId || 'unknown',
      placedAt: Date.now(),
    };
    this.session?.send({ type: 'object_placed', object: newObject });
    return newObject.id;
  }

  moveObject(objectId: string, transform: Transform3D) {
    this.session?.send({ type: 'object_moved', objectId, transform });
  }

  deleteObject(objectId: string) {
    this.session?.send({ type: 'object_deleted', objectId });
  }

  getObjects(): SharedObject3D[] {
    return Array.from(this.objects.values());
  }

  subscribe(callback: (objects: SharedObject3D[]) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.getObjects()));
  }

  // Save current layout
  saveLayout(name: string) {
    const layout = {
      id: Date.now().toString(),
      name,
      objects: this.getObjects(),
      createdAt: Date.now(),
    };
    localStorage.setItem(`layout_${layout.id}`, JSON.stringify(layout));
    
    // Also save to a list of layouts
    const layouts = JSON.parse(localStorage.getItem('saved_layouts') || '[]');
    layouts.push({ id: layout.id, name: layout.name, createdAt: layout.createdAt });
    localStorage.setItem('saved_layouts', JSON.stringify(layouts));
    
    return layout.id;
  }

  // Load a saved layout
  loadLayout(layoutId: string) {
    const saved = localStorage.getItem(`layout_${layoutId}`);
    if (saved) {
      const layout = JSON.parse(saved);
      // Clear current objects
      this.objects.forEach(obj => this.deleteObject(obj.id));
      // Add saved objects
      layout.objects.forEach((obj: SharedObject3D) => {
        this.session?.send({ type: 'object_placed', object: obj });
      });
      return true;
    }
    return false;
  }

  // Get all saved layouts
  getSavedLayouts() {
    return JSON.parse(localStorage.getItem('saved_layouts') || '[]');
  }
}