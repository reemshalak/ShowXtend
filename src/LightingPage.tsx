/**
 * LightingPage — Standalone XR scene for room lighting control.
 * URL: /lighting
 *
 * Features:
 * - Lighting presets (Warm, Cool, Daylight, Evening, Showroom)
 * - Color temperature slider
 * - Floor & wall material picker (visual tint simulation)
 * - Broadcasts changes via BroadcastChannel so PlaceItView can apply them
 *
 * Note: In PICO passthrough, we can't change real room lighting.
 * We simulate it by applying a tinted overlay + adjusting the 3D model
 * lighting environment via Three.js Environment preset broadcast.
 */

import { useState } from 'react';

const LIGHTING_CHANNEL = 'lighting-channel';

interface LightingPreset {
  id: string;
  label: string;
  icon: string;
  temp: number;       // colour temperature 2700–6500K
  brightness: number; // 0–100
  tint: string;       // CSS rgba for overlay
  threePreset: string; // Three.js Environment preset name
}

const PRESETS: LightingPreset[] = [
  { id: 'warm',      label: 'Warm',      icon: '🕯',  temp: 2700, brightness: 70,  tint: 'rgba(255,180,80,0.08)',   threePreset: 'sunset'     },
  { id: 'daylight',  label: 'Daylight',  icon: '☀️',  temp: 5500, brightness: 100, tint: 'rgba(255,255,255,0.0)',   threePreset: 'park'       },
  { id: 'cool',      label: 'Cool',      icon: '❄️',  temp: 6500, brightness: 90,  tint: 'rgba(160,200,255,0.06)', threePreset: 'dawn'       },
  { id: 'evening',   label: 'Evening',   icon: '🌆',  temp: 3200, brightness: 55,  tint: 'rgba(255,120,50,0.12)',  threePreset: 'night'      },
  { id: 'showroom',  label: 'Showroom',  icon: '💡',  temp: 4000, brightness: 100, tint: 'rgba(255,255,240,0.04)', threePreset: 'warehouse'  },
];

const FLOOR_MATERIALS = [
  { id: 'wood-light',  label: 'Light Oak',  color: '#d4a96a' },
  { id: 'wood-dark',   label: 'Dark Walnut', color: '#5c3a1e' },
  { id: 'marble',      label: 'Marble',      color: '#e8e8e8' },
  { id: 'concrete',    label: 'Concrete',    color: '#9e9e9e' },
  { id: 'carpet-grey', label: 'Grey Carpet', color: '#b0b0b0' },
];

const WALL_COLORS = [
  { id: 'white',       label: 'White',        color: '#f5f5f5' },
  { id: 'warm-grey',   label: 'Warm Grey',    color: '#c9bfb4' },
  { id: 'sage',        label: 'Sage',         color: '#9cad9b' },
  { id: 'navy',        label: 'Navy',         color: '#2d3e50' },
  { id: 'terracotta',  label: 'Terracotta',   color: '#c1765a' },
  { id: 'blush',       label: 'Blush',        color: '#e8c4b8' },
];

function broadcast(data: object) {
  const ch = new BroadcastChannel(LIGHTING_CHANNEL);
  ch.postMessage(data);
  ch.close();
}

export default function LightingPage() {
  const [activePreset, setActivePreset]   = useState<string>('daylight');
  const [brightness, setBrightness]       = useState(100);
  const [temperature, setTemperature]     = useState(5500);
  const [activeFloor, setActiveFloor]     = useState('wood-light');
  const [activeWall, setActiveWall]       = useState('white');

  const applyPreset = (p: LightingPreset) => {
    setActivePreset(p.id);
    setBrightness(p.brightness);
    setTemperature(p.temp);
    broadcast({ type: 'lighting', preset: p.id, brightness: p.brightness, temp: p.temp, tint: p.tint, threePreset: p.threePreset });
  };

  const applyFloor = (id: string) => {
    setActiveFloor(id);
    broadcast({ type: 'floor', material: id });
  };

  const applyWall = (id: string) => {
    setActiveWall(id);
    broadcast({ type: 'wall', color: id });
  };

  const currentPreset = PRESETS.find((p) => p.id === activePreset)!;

  return (
    <div className="xr-single-panel-root">
      <div enable-xr className="spatial-panel lighting-panel">

        <h3 className="lighting-title">Room Lighting</h3>

        {/* Preset buttons */}
        <div className="lighting-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`lighting-preset-btn ${activePreset === p.id ? 'lighting-preset-btn--active' : ''}`}
              onClick={() => applyPreset(p)}
            >
              <span className="lighting-preset-icon">{p.icon}</span>
              <span className="lighting-preset-label">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Sliders */}
        <div className="lighting-sliders">
          <div className="lighting-slider-row">
            <span className="lighting-slider-label">☀ Brightness</span>
            <input
              type="range" min={20} max={100}
              value={brightness}
              className="lighting-slider"
              onChange={(e) => {
                const v = Number(e.target.value);
                setBrightness(v);
                broadcast({ type: 'lighting', preset: activePreset, brightness: v, temp: temperature, tint: currentPreset.tint, threePreset: currentPreset.threePreset });
              }}
            />
            <span className="lighting-slider-value">{brightness}%</span>
          </div>

          <div className="lighting-slider-row">
            <span className="lighting-slider-label">🌡 Temperature</span>
            <input
              type="range" min={2700} max={6500}
              value={temperature}
              className="lighting-slider lighting-slider--temp"
              onChange={(e) => {
                const v = Number(e.target.value);
                setTemperature(v);
                broadcast({ type: 'lighting', preset: activePreset, brightness, temp: v, tint: currentPreset.tint, threePreset: currentPreset.threePreset });
              }}
            />
            <span className="lighting-slider-value">{temperature}K</span>
          </div>
        </div>

        {/* Floor material */}
        <div className="lighting-section">
          <p className="lighting-section-title">Floor</p>
          <div className="material-swatches">
            {FLOOR_MATERIALS.map((m) => (
              <button
                key={m.id}
                className={`material-swatch ${activeFloor === m.id ? 'material-swatch--active' : ''}`}
                style={{ background: m.color }}
                title={m.label}
                onClick={() => applyFloor(m.id)}
              />
            ))}
          </div>
        </div>

        {/* Wall color */}
        <div className="lighting-section">
          <p className="lighting-section-title">Wall</p>
          <div className="material-swatches">
            {WALL_COLORS.map((w) => (
              <button
                key={w.id}
                className={`material-swatch ${activeWall === w.id ? 'material-swatch--active' : ''}`}
                style={{ background: w.color }}
                title={w.label}
                onClick={() => applyWall(w.id)}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
