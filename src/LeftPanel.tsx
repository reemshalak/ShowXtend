/**
 * LeftPanel — Scrollable product list.
 * Matches the left column in the reference screenshot.
 * enable-xr on the root div makes the whole panel a WebSpatial glass pane.
 */

import { PRODUCTS, type Product } from './data';

interface LeftPanelProps {
  selectedId: number;
  onSelect: (p: Product) => void;
}

export default function LeftPanel({ selectedId, onSelect }: LeftPanelProps) {
  return (
    <div enable-xr className="spatial-panel left-panel">
      <button className="back-btn">
        ← All chairs
      </button>

      {PRODUCTS.map((p) => (
        <button
          key={p.id}
          className={`product-list-item ${p.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(p)}
        >
          <div className="product-list-thumb">
            <span style={{ fontSize: '1.4rem' }}>{p.emoji}</span>
          </div>
          <div className="product-list-info">
            <div className="product-list-name">{p.name}</div>
            <div className="product-list-sub">{p.type}</div>
          </div>
          <span className="product-list-price">{p.price}</span>
        </button>
      ))}
    </div>
  );
}
