/**
 * CompareView — Vision Pro-style spatial product comparison.
 *
 * Usage (web): rendered as a modal overlay from CenterPanelPage.
 * Usage (XR):  opened as its own window via window.open('/compare', ...).
 *
 * Products flow in with spring animations. The comparison table fades in
 * once both slots are filled. "Better" badges animate in with a stagger.
 *
 * Props:
 *   initialLeft / initialRight  — pre-fill slots (e.g. from "Compare" button on a card)
 *   catalog                     — the live product list to show in the picker strip
 *   onClose                     — dismiss (web modal)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Product } from './data';
import { PRODUCTS } from './data';
//@ts-ignore
import './CompareView.css';

// ── Extended product type (IKEA API fields are optional) ─────────────────────
type ComparableProduct = Product & {
  reviewCount?: number;
  imageUrl?:    string;
  material?:    string;
  assembly?:    string;
  warranty?:    string;
  weight?:      string;
  delivery?:    string;
};

// ── Spec row definitions ──────────────────────────────────────────────────────
interface SpecRow {
  key:    string;
  label:  string;
  fmt:    (p: ComparableProduct) => string;
  better: 'lower' | 'higher' | 'none';
}

const SPECS: SpecRow[] = [
  { key:'price',    label:'Price',          fmt: p => p.priceNum ? `$${p.priceNum}` : p.price,  better:'lower'  },
  { key:'rating',   label:'Rating',         fmt: p => `${(p.rating ?? 4.0).toFixed(1)} / 5`,    better:'higher' },
  { key:'reviews',  label:'Reviews',        fmt: p => `${(p.reviewCount ?? 0).toLocaleString()}`, better:'higher' },
  { key:'type',     label:'Type',           fmt: p => p.type ?? 'Furniture',                    better:'none'   },
  // 🔥 Fix line 48: Add parentheses
  { key:'dims',     label:'Dimensions',     fmt: p => p.dims ? `${p.dims.w}×${p.dims.h}×${p.dims.d} cm` : ((p as any).measurement || '—'), better:'none' },
  { key:'designer', label:'Designer',       fmt: p => (p as any).designer ?? 'IKEA',            better:'none'   },
  // 🔥 Fix line 51: Add parentheses
  { key:'material', label:'Material',       fmt: p => (p as any).material ?? ((p as any).materials?.join(', ') || '—'), better:'none' },
  { key:'assembly', label:'Assembly',       fmt: p => (p as any).assembly ?? 'Required',        better:'none'   },
  { key:'warranty', label:'Warranty',       fmt: p => (p as any).warranty ?? '1 year',          better:'none'   },
  // 🔥 Fix weight line similarly
  { key:'weight',   label:'Weight',         fmt: p => (p as any).weight ?? ((p as any).dims?.weight || '—'), better:'none' },
  { key:'delivery', label:'Est. delivery',  fmt: p => (p as any).delivery ?? '3-5 days',        better:'none'   },
];

function winner(spec: SpecRow, L: ComparableProduct, R: ComparableProduct): 'left'|'right'|'tie' {
  if (spec.better === 'none') return 'tie';
  const lv = spec.key === 'price'  ? (L.priceNum ?? 999999)
           : spec.key === 'rating' ? (L.rating ?? 0)
           : spec.key === 'reviews'? (L.reviewCount ?? 0)
           : 0;
  const rv = spec.key === 'price'  ? (R.priceNum ?? 999999)
           : spec.key === 'rating' ? (R.rating ?? 0)
           : spec.key === 'reviews'? (R.reviewCount ?? 0)
           : 0;
  if (lv === rv) return 'tie';
  if (spec.better === 'lower')  return lv < rv ? 'left' : 'right';
  if (spec.better === 'higher') return lv > rv ? 'left' : 'right';
  return 'tie';
}

// ── Product image ─────────────────────────────────────────────────────────────
function ProductImage({ product, size = 120 }: { product: ComparableProduct; size?: number }) {
  const [err, setErr] = useState(false);
  const url = product.imageUrl;
  if (url && !err) {
    return (
      <img
        src={url}
        alt={product.name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, objectFit: 'contain', mixBlendMode: 'multiply' }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.6, lineHeight: 1 }}>{product.emoji ?? '🪑'}</span>;
}

// ── Empty slot placeholder ────────────────────────────────────────────────────
function EmptySlot({ side }: { side: 'left' | 'right' }) {
  return (
    <div className="cv-empty-slot">
      <div className="cv-empty-ring">+</div>
      <p className="cv-empty-label">
        {side === 'left' ? 'Select first product' : 'Select second product'}
      </p>
    </div>
  );
}

// ── Filled slot ───────────────────────────────────────────────────────────────
function FilledSlot({
  product, side, visible,
}: { product: ComparableProduct; side: 'left'|'right'; visible: boolean }) {
  return (
    <div className={`cv-product-in-slot ${visible ? 'cv-product-in-slot--visible' : ''}`}>
      <button className="cv-purchase-btn">PURCHASE</button>
      <div className="cv-slot-name">{product.name}</div>
      <div className="cv-slot-sub">{product.fullType ?? product.type}</div>
      <div className="cv-slot-image">
        <ProductImage product={product} size={140} />
      </div>
      <div className="cv-slot-price">${product.priceNum ?? product.price}</div>
      <div className="cv-slot-price-note">*prices may vary by region</div>
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────
function CompareTable({
  left, right, visible,
}: { left: ComparableProduct; right: ComparableProduct; visible: boolean }) {
  return (
    <div className={`cv-compare-section ${visible ? 'cv-compare-section--visible' : ''}`}>
      <table className="cv-table">
        <thead>
          <tr>
            <th className="cv-th-spec">Spec</th>
            <th className="cv-th-val">{left.name}</th>
            <th className="cv-th-val">{right.name}</th>
          </tr>
        </thead>
        <tbody>
          {SPECS.map((spec, i) => {
            const w = winner(spec, left, right);
            const lWin = w === 'left', rWin = w === 'right';
            return (
              <tr key={spec.key} className="cv-row">
                <td className="cv-cell cv-cell--label">{spec.label}</td>
                <td className={`cv-cell ${lWin ? 'cv-cell--win' : rWin ? 'cv-cell--lose' : ''}`}>
                  {spec.fmt(left)}
                  {lWin && (
                    <span
                      className="cv-win-badge"
                      style={{ animationDelay: `${i * 40 + 200}ms` }}
                    >
                      Better
                    </span>
                  )}
                </td>
                <td className={`cv-cell ${rWin ? 'cv-cell--win' : lWin ? 'cv-cell--lose' : ''}`}>
                  {spec.fmt(right)}
                  {rWin && (
                    <span
                      className="cv-win-badge"
                      style={{ animationDelay: `${i * 40 + 200}ms` }}
                    >
                      Better
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Catalog strip card ────────────────────────────────────────────────────────
function CatalogCard({
  product, selectedLeft, selectedRight, onPick,
}: {
  product: ComparableProduct;
  selectedLeft:  boolean;
  selectedRight: boolean;
  onPick: (p: ComparableProduct) => void;
}) {
  return (
    <button
      className={[
        'cv-catalog-card',
        selectedLeft  ? 'cv-catalog-card--left'  : '',
        selectedRight ? 'cv-catalog-card--right' : '',
      ].join(' ')}
      onClick={() => onPick(product)}
    >
      {selectedLeft  && <span className="cv-dot cv-dot--left"  />}
      {selectedRight && <span className="cv-dot cv-dot--right" />}
      <ProductImage product={product} size={48} />
      <span className="cv-catalog-name">{product.name}</span>
      <span className="cv-catalog-price">${product.priceNum ?? product.price}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface CompareViewProps {
  catalog?:       ComparableProduct[];
  initialLeft?:   ComparableProduct;
  initialRight?:  ComparableProduct;
  onClose?:       () => void;
}

export default function CompareView({
  catalog = PRODUCTS as ComparableProduct[],
  initialLeft,
  initialRight,
  onClose,
}: CompareViewProps) {
  const [left,       setLeft]       = useState<ComparableProduct | null>(initialLeft ?? null);
  const [right,      setRight]      = useState<ComparableProduct | null>(initialRight ?? null);
  const [leftVisible,  setLeftVisible]  = useState(false);
  const [rightVisible, setRightVisible] = useState(false);
  const [tableVisible, setTableVisible] = useState(false);

  // Animate left slot in
  useEffect(() => {
    if (!left) { setLeftVisible(false); return; }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setLeftVisible(true)));
    return () => cancelAnimationFrame(t);
  }, [left]);

  // Animate right slot in
  useEffect(() => {
    if (!right) { setRightVisible(false); return; }
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setRightVisible(true)));
    return () => cancelAnimationFrame(t);
  }, [right]);

  // Animate table in when both filled
  useEffect(() => {
    if (!left || !right) { setTableVisible(false); return; }
    const t = setTimeout(() => setTableVisible(true), 120);
    return () => clearTimeout(t);
  }, [left, right]);

  const handlePick = useCallback((product: ComparableProduct) => {
    if (!left) {
      setLeft(product);
    } else if (!right) {
      setRight(product);
    } else {
      // Both full: replace left, clear right for next pick
      setLeft(product);
      setRight(null);
      setTableVisible(false);
    }
  }, [left, right]);

  const bothFilled = !!left && !!right;

  return (
    <div className="cv-root">

      {/* ── Nav pill ── */}
      <div className="cv-nav-pill">
        {['📖','★','⊞','🛍','👤','🔍'].map((icon, i) => (
          <button key={i} className={`cv-nav-icon ${i === 2 ? 'cv-nav-icon--active' : ''}`}>
            {icon}
          </button>
        ))}
        {onClose && (
          <button className="cv-nav-icon cv-nav-close" onClick={onClose} title="Close">
            ✕
          </button>
        )}
      </div>

      {/* ── Compare stage ── */}
      <div className="cv-stage">

        {/* Left slot */}
        <div className={`cv-slot cv-slot--left ${left ? 'cv-slot--filled' : ''}`}>
          {!left ? (
            <EmptySlot side="left" />
          ) : (
            <FilledSlot product={left} side="left" visible={leftVisible} />
          )}
        </div>

        {/* Center VS divider */}
        <div className="cv-center">
          <div className="cv-center-line" />
          <div className="cv-vs">VS</div>
          <div className="cv-center-line" />
        </div>

        {/* Right slot */}
        <div className={`cv-slot cv-slot--right ${right ? 'cv-slot--filled' : ''}`}>
          {!right ? (
            <EmptySlot side="right" />
          ) : (
            <FilledSlot product={right} side="right" visible={rightVisible} />
          )}
        </div>

        {/* Comparison table — spans full width */}
        {bothFilled && (
          <CompareTable left={left} right={right} visible={tableVisible} />
        )}
      </div>

      {/* ── Catalog strip ── */}
      <p className="cv-catalog-label">Browse products</p>
      <div className="cv-catalog-strip">
        {catalog.map(p => (
          <CatalogCard
            key={p.id}
            product={p}
            selectedLeft={left?.id  === p.id}
            selectedRight={right?.id === p.id}
            onPick={handlePick}
          />
        ))}
      </div>

      {/* Bottom strip */}
      <div className="cv-bottom">
        <button className="cv-all-btn">
          All products
          <span className="cv-chevron">›</span>
        </button>
      </div>
    </div>
  );
}
