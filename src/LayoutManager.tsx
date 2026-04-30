/**
 * LayoutManager — Floating panel for saving / loading / deleting scene layouts.
 * Also shows wishlist + cart item counts for quick reference.
 * Opens as a draggable overlay from the top-right toolbar.
 */

import { useState } from 'react';
import { sceneStore, type SavedLayout } from './sceneStore';

interface LayoutManagerProps {
  onClose: () => void;
  wishlistCount: number;
  cartCount: number;
}

export default function LayoutManager({ onClose, wishlistCount, cartCount }: LayoutManagerProps) {
  const [layouts, setLayouts]   = useState<SavedLayout[]>(() => sceneStore.getLayouts());
  const [saveName, setSaveName] = useState('');
  const [saved, setSaved]       = useState(false);
  const [confirm, setConfirm]   = useState<string | null>(null); // id to delete

  const refreshLayouts = () => setLayouts(sceneStore.getLayouts());

  const handleSave = () => {
    const name = saveName.trim() || `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    sceneStore.saveLayout(name);
    setSaveName('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    refreshLayouts();
  };

  const handleLoad = (id: string) => {
    sceneStore.loadLayout(id);
    onClose();
  };

  const handleDelete = (id: string) => {
    sceneStore.deleteLayout(id);
    setConfirm(null);
    refreshLayouts();
  };

  const objectCount = sceneStore.getObjects().length;

  return (
    <div className="layout-manager">
      <div className="layout-manager-header">
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>🗂 Layouts</span>
        <button className="assistant-clear-btn" onClick={onClose}>✕</button>
      </div>

      {/* Current scene status */}
      <div className="layout-scene-status">
        <div className="layout-stat">
          <span className="layout-stat-num">{objectCount}</span>
          <span className="layout-stat-label">Objects</span>
        </div>
        <div className="layout-stat">
          <span className="layout-stat-num">{wishlistCount}</span>
          <span className="layout-stat-label">Wishlisted</span>
        </div>
        <div className="layout-stat">
          <span className="layout-stat-num">{cartCount}</span>
          <span className="layout-stat-label">In cart</span>
        </div>
      </div>

      {/* Save current layout */}
      <div className="layout-save-row">
        <input
          className="collab-input"
          placeholder="Name this layout…"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          style={{ flex: 1 }}
        />
        <button className="collab-create-btn" style={{ flexShrink: 0, padding: '0.5rem 0.85rem', fontSize: '0.8rem' }} onClick={handleSave}>
          {saved ? '✓ Saved' : '💾 Save'}
        </button>
      </div>

      {/* Clear scene */}
      {objectCount > 0 && (
        <button
          onClick={() => { if (confirm === 'clear') { sceneStore.clearAll(); setConfirm(null); } else setConfirm('clear'); }}
          style={{
            background: confirm === 'clear' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)',
            border: confirm === 'clear' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, color: confirm === 'clear' ? '#fca5a5' : 'rgba(255,255,255,0.5)',
            fontSize: '0.78rem', padding: '0.4rem 0.75rem', cursor: 'pointer', width: '100%',
          }}
        >
          {confirm === 'clear' ? '⚠ Tap again to clear all objects' : '🗑 Clear current scene'}
        </button>
      )}

      {/* Saved layouts list */}
      <div className="layout-section-label">Saved layouts ({layouts.length})</div>
      {layouts.length === 0 && (
        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', margin: 0, textAlign: 'center', padding: '1rem 0' }}>
          No saved layouts yet
        </p>
      )}
      <div className="layout-list">
        {layouts.map((l) => (
          <div key={l.id} className="layout-item">
            <div className="layout-item-info">
              <span className="layout-item-name">{l.name}</span>
              <span className="layout-item-meta">{l.objects.length} objects · {new Date(l.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="layout-item-actions">
              <button className="layout-load-btn" onClick={() => handleLoad(l.id)} title="Load">↩ Load</button>
              <button
                className="layout-del-btn"
                onClick={() => confirm === l.id ? handleDelete(l.id) : setConfirm(l.id)}
                title="Delete"
              >
                {confirm === l.id ? '⚠' : '🗑'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
