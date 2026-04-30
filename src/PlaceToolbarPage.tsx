/**
 * PlaceToolbarPage — Standalone XR scene for the circular action toolbar.
 * Opened by PlaceItView at '/place-toolbar'.
 * Broadcasts tool actions via BroadcastChannel.
 */

import { useState } from 'react';

const CHANNEL_NAME = 'place-toolbar-actions';

const TOOLS = [
  { id: 'place',     icon: '🧭', label: 'Place / Navigate' },
  { id: 'color',     icon: '🎨', label: 'Color change' },
  { id: 'scale',     icon: '⚖️', label: 'Scale' },
  { id: 'duplicate', icon: '⎘',  label: 'Duplicate' },
  { id: 'delete',    icon: '🗑', label: 'Delete', danger: true },
];

export default function PlaceToolbarPage() {
  const [activeTool, setActiveTool] = useState<string>('place');

  const handleTool = (id: string) => {
    setActiveTool(id);
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'tool', tool: id });
    channel.close();
  };

  return (
    <div className="xr-single-panel-root">
      <div enable-xr className="spatial-panel place-toolbar-panel">
        <div className="toolbar-buttons">
          {TOOLS.map((btn) => (
            <button
              key={btn.id}
              enable-xr
              className={`tool-btn ${activeTool === btn.id ? 'tool-btn--active' : ''} ${btn.danger ? 'tool-btn--danger' : ''}`}
              onClick={() => handleTool(btn.id)}
              title={btn.label}
              aria-label={btn.label}
            >
              <span className="tool-btn-icon">{btn.icon}</span>
            </button>
          ))}
        </div>
        <button
          enable-xr
          className={`tool-btn tool-btn--info ${activeTool === 'info' ? 'tool-btn--active' : ''}`}
          onClick={() => handleTool('info')}
          aria-label="Dimensions"
        >
          ℹ
        </button>
      </div>
    </div>
  );
}
