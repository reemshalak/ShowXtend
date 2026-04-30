/**
 * CenterPanel.tsx — visionOS-grade product detail panel.
 *
 * ALL original props preserved and wired:
 *   product, cartCount, onAddToCart, onPlaceIt,
 *   onWishlist, onAssistant, onLighting, onCollab
 *
 * New interactions:
 *   • Wishlisted heart toggle (local + calls onWishlist)
 *   • Compare button (calls onCompare or logs)
 *   • Image 3D parallax on pointer move (depth illusion)
 *   • Image levitation float animation
 *   • Color swatch selector (updates displayed color)
 *   • Qty stepper with spring animation
 *   • Add-to-cart → pulse confirmation flash
 *   • Place-it → ripple effect
 *   • Tab bar as separate floating pill
 *   • Footer thumbnails show product variants
 *   • All buttons: scale spring + glow on hover/active
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProductDetails } from './ikeaApi';
import type { ProductDetail } from './ikeaApi';
import type { Product } from './data';
import { ProductImage } from './components/productImage';
import { isXRMode } from './xrMode';
import PersistentNav from './components/PersistentNav';

//@ts-ignore
import './css/detail-product-panel.css';

// ── Extended props (onCompare optional — won't break if not passed) ──────────
interface Props {
  product:          Product;
  cartCount:        number;
  wishlistCount?:   number;
  onAddToCart:      () => void;
  onPlaceIt:        () => void;
  onWishlist:       () => void;
  onAssistant:      () => void;
  onLighting:       () => void;
  onCollab:         () => void;
  onCompare?:       (product: Product) => void;
  // Nav props
  onBack:           () => void;   // ← back to BrowsePage
  onOpenCart?:      () => void;
  onOpenWishlist?:  () => void;
  onOpenAssistant?: () => void;
  onOpenCollab?:    () => void;
  onOpenLighting?:  () => void;
  onOpenLayouts?:   () => void;
  isCallActive?:    boolean;
}

// ── Category tabs ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'chair',   label: 'Chair & Sofa' },
  { id: 'bed',     label: 'Beds & Mattresses' },
  { id: 'storage', label: 'Storage' },
  { id: 'kitchen', label: 'Kitchen' },
];

// ── Color swatches ────────────────────────────────────────────────────────────
const SWATCHES = [
  { id: 'oak',    label: 'Light Oak',    hex: '#d4a96a' },
  { id: 'walnut', label: 'Dark Walnut',  hex: '#5c3a1e' },
  { id: 'white',  label: 'White',        hex: '#f0ede8' },
  { id: 'grey',   label: 'Smoke Grey',   hex: '#8e9098' },
  { id: 'black',  label: 'Matte Black',  hex: '#1c1c1e' },
];

// ── Spring button (micro-interaction wrapper) ─────────────────────────────────
function SpringBtn({
  children,
  onClick,
  className = '',
  style = {},
  title,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const press = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'scale(0.91)';
    el.style.transition = 'transform 0.08s ease';
  };
  const release = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'scale(1.04)';
    el.style.transition = 'transform 0.18s cubic-bezier(0.16,1,0.3,1)';
    setTimeout(() => {
      if (el) { el.style.transform = 'scale(1)'; el.style.transition = 'transform 0.25s cubic-bezier(0.16,1,0.3,1)'; }
    }, 160);
  };

  return (
    <button
      ref={ref}
      className={`cp-spring-btn ${className}`}
      onClick={onClick}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      title={title}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

// ── Derive a display hex from a natural-language color/material name ─────────
function colorNameToHex(title: string): string {
  const t = title.toLowerCase();
  if (/white|birch|cream|ivory|light/.test(t))          return '#f0ede8';
  if (/black|ebony|dark stain|noir/.test(t))            return '#1c1c1e';
  if (/oak|pine|beige|sand|natural|antique/.test(t))    return '#d4a96a';
  if (/walnut|brown|teak|mahogany/.test(t))             return '#7c4f2a';
  if (/grey|gray|silver|anthracite|smoke/.test(t))      return '#8e9098';
  if (/blue|navy|teal|cyan/.test(t))                    return '#4a7fa5';
  if (/green|olive|sage|forest/.test(t))                return '#6b8f6b';
  if (/red|rust|burgundy|terracotta/.test(t))           return '#a0473e';
  if (/yellow|mustard|ochre|gold/.test(t))              return '#c8a84b';
  if (/pink|rose|blush/.test(t))                        return '#d4848a';
  if (/purple|lilac|lavender/.test(t))                  return '#8878b0';
  if (/stainless|chrome|metal|steel/.test(t))           return '#b0b8c0';
  return '#888888'; // neutral fallback
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CenterPanel({
  product,
  cartCount,
  wishlistCount = 0,
  onAddToCart,
  onPlaceIt,
  onWishlist,
  onAssistant,
  onLighting,
  onCollab,
  onCompare,
  onBack,
  onOpenCart,
  onOpenWishlist,
  onOpenAssistant,
  onOpenCollab,
  onOpenLighting,
  onOpenLayouts,
  isCallActive,
}: Props) {

  const [qty,          setQty]          = useState(1);
  const [category,     setCategory]     = useState('chair');
  const [wishlisted,   setWishlisted]   = useState(false);
  const [addFlash,     setAddFlash]     = useState(false);
  const [placeRipple,  setPlaceRipple]  = useState(false);
  const [imgTilt,      setImgTilt]      = useState({ x: 0, y: 0 });
  const [imgHover,     setImgHover]     = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // ── Product detail (lazy fetch, cached in ikeaApi) ────────────────────────
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reset state + fetch detail when product changes
  useEffect(() => {
    setWishlisted(false);
    setQty(1);
    setDetail(null);

    const ikeaId = (product as any).ikeaId;
    if (!ikeaId) return;

    setDetailLoading(true);
    getProductDetails(ikeaId).then(d => {
      setDetail(d);
    }).finally(() => setDetailLoading(false));
  }, [product.id]);

  // Merge detail data with product (detail takes priority where available)
  const displayRating     = detail?.rating.average     ?? product.rating     ?? 4.0;
  const displayReviewCount= detail?.rating.reviewCount ?? (product as any).reviewCount ?? 0;
  const displayDescription= detail?.description        ?? product.description ?? '';
  const displayDesigner   = detail?.designerName       ?? product.designer    ?? 'IKEA';
  const displayMeasurement= detail?.measurement        ?? '';
  // Gallery: prefer detail gallery, fallback to product imageUrl
  const galleryImages     = detail?.gallery?.length
    ? detail.gallery
    : [(product as any).imageUrl].filter(Boolean);
  // Real variants from API (fallback to static SWATCHES if none)
  const apiVariants = detail?.variants ?? [];

  // ── Active variant: drives color swatch selection + image swap ──────────────
  const [activeVariantIdx, setActiveVariantIdx] = useState<number>(-1); // -1 = base product

  // Reset to base product when product changes
  useEffect(() => { setActiveVariantIdx(-1); }, [product.id]);

  // Build swatches from API variants (with derived hex colors from title)
  const variantSwatches = apiVariants.map((v, i) => ({
    idx:      i,
    id:       v.id,
    label:    v.title || `Variant ${i + 1}`,
    hex:      colorNameToHex(v.title),
    imageUrl: v.imageUrl,
    url:      v.url,
  }));

  // The image to show: active variant image or base product image
  const activeVariantImage = activeVariantIdx >= 0
    ? (variantSwatches[activeVariantIdx]?.imageUrl || (product as any).imageUrl)
    : (product as any).imageUrl;

  // Label shown next to category in subtitle
  const activeColorLabel = activeVariantIdx >= 0
    ? variantSwatches[activeVariantIdx]?.label
    : (detail?.productName
        ? detail.productName.replace(product.name, '').trim()
        : (product as any).fullType?.split(' · ')[1] ?? 'Default');

  // Dot color for subtitle
  const activeColorHex = activeVariantIdx >= 0
    ? variantSwatches[activeVariantIdx]?.hex
    : colorNameToHex((product as any).fullType ?? '');

  // IKEA product URL — from detail or fallback
  const ikeaUrl = detail
    ? `https://www.ikea.com/us/en/p/-${(detail.ikeaId ?? '').replace(/\./g, '')}/`
    : ((product as any).ikeaUrl ?? `https://www.ikea.com/us/en/search/products/?q=${encodeURIComponent(product.name)}`);

  // ── Add to cart with qty loop + flash feedback ──────────────────────────────
  const handleAdd = useCallback(() => {
    for (let i = 0; i < qty; i++) onAddToCart();
    setAddFlash(true);
    setTimeout(() => setAddFlash(false), 600);
  }, [qty, onAddToCart]);

  // ── Place it with ripple feedback ───────────────────────────────────────────
  const handlePlaceIt = useCallback(() => {
    setPlaceRipple(true);
    setTimeout(() => setPlaceRipple(false), 700);
    onPlaceIt();
  }, [onPlaceIt]);

  // ── Wishlist toggle ─────────────────────────────────────────────────────────
  const handleWishlist = useCallback(() => {
    setWishlisted(v => !v);
    onWishlist();
  }, [onWishlist]);

  // ── Compare ─────────────────────────────────────────────────────────────────
  const handleCompare = useCallback(() => {
    onCompare?.(product);
  }, [onCompare, product]);

  // ── Image 3D parallax on pointer move ──────────────────────────────────────
  const handleImgMove = useCallback((e: React.PointerEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width  - 0.5;  // -0.5 → 0.5
    const ny = (e.clientY - rect.top)  / rect.height - 0.5;
    setImgTilt({ x: ny * -18, y: nx * 18 });
  }, []);

  const handleImgLeave = useCallback(() => {
    setImgTilt({ x: 0, y: 0 });
    setImgHover(false);
  }, []);

  const imgTransform = imgHover
    ? `perspective(800px) rotateX(${imgTilt.x}deg) rotateY(${imgTilt.y}deg) scale(1.06) translateY(-8px)`
    : 'perspective(800px) rotateX(0) rotateY(0) scale(1) translateY(0)';

  return (
    <>
    {/* ── Page layout: nav pill LEFT + panel RIGHT ────────────────────── */}
    <div className="xr-single-center-panel-root" style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.25rem',
    }}>

      {/* ── Left: PersistentNav pill with back arrow baked in ───────── */}
      <PersistentNav
        cartCount={cartCount}
        wishlistCount={wishlistCount}
        activeMode="catalog"
        isCallActive={isCallActive}
        onBrowse={onBack}
        onBack={onBack}
        onOpenCart={onOpenCart ?? (() => {})}
        onOpenWishlist={onOpenWishlist ?? onWishlist}
        onOpenAssistant={onOpenAssistant ?? onAssistant}
        onOpenCollab={onOpenCollab ?? onCollab}
        onOpenLighting={onOpenLighting ?? onLighting}
        onOpenLayouts={onOpenLayouts}
      />


      
      {/* ═══ FLOATING CATEGORY BAR ═══════════════════════════════════════ */}
      {/* <div className="top-floating-bar spatial-panel" style={{
        display: 'flex', gap: '0.25rem',
        padding: '0.4rem 0.5rem',
        borderRadius: 999,
        background: 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.11)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.10)',
        position: 'absolute',
        top: -58, left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap',
        zIndex: 10,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setCategory(t.id)}
            className={`cp-spring-btn${category === t.id ? ' cp-tab-active' : ''}`}
            style={{
              position: 'relative',
              padding: '0.38rem 1rem',
              borderRadius: 999,
              background: category === t.id ? 'rgba(255,255,255,0.16)' : 'transparent',
              border: '1px solid ' + (category === t.id ? 'rgba(255,255,255,0.22)' : 'transparent'),
              color: category === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '0.78rem',
              fontWeight: category === t.id ? 600 : 400,
              letterSpacing: '0.01em',
              boxShadow: category === t.id ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div> */}

      {/* ═══ MAIN PANEL ══════════════════════════════════════════════════ */}
      <div className="center-panel spatial-panel" style={{
        width: 'clamp(520px, 50vw, 660px)',
        minHeight: 520,
        padding: '1.75rem 2rem 1.5rem',
        borderRadius: 28,
        background: 'rgba(14,14,20,0.78)',
        backdropFilter: 'blur(40px) saturate(160%)',
        WebkitBackdropFilter: 'blur(40px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.55), inset 0 1.5px 0 rgba(255,255,255,0.10)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'visible',
        // Specular sheen via pseudo handled in global CSS (see .center-panel::before patch below)
      }}>

        {/* ── Corner icon buttons (top-right cluster) ─────────────────── */}
        <div style={{
          position: 'absolute', top: '1rem', right: '1rem',
          display: 'flex', gap: '0.45rem', zIndex: 5,
        }}>
          {/* Wishlist / Heart */}
          <SpringBtn
            className="cp-icon-btn"
            onClick={handleWishlist}
            title={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: wishlisted
                ? 'rgba(248,113,113,0.18)'
                : 'rgba(255,255,255,0.08)',
              border: '1px solid ' + (wishlisted ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.14)'),
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.05rem',
              boxShadow: wishlisted ? '0 0 14px rgba(248,113,113,0.3)' : 'none',
            }}
          >
            <span
              key={String(wishlisted)}
              className="cp-heart-pop"
              style={{ color: wishlisted ? '#f87171' : 'rgba(255,255,255,0.7)', lineHeight: 1 }}
            >
              {wishlisted ? '♥' : '♡'}
            </span>
          </SpringBtn>

          {/* Compare */}
          <SpringBtn
            className="cp-icon-btn"
            onClick={handleCompare}
            title="Compare products"
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', color: 'rgba(255,255,255,0.7)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h5M9 8h5M6 4l-4 4 4 4M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </SpringBtn>

       
          {/* IKEA link */}
          <a
            href={ikeaUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View on IKEA"
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'rgba(255,203,5,0.12)',
              border: '1px solid rgba(255,203,5,0.28)',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              textDecoration: 'none',
              transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.2s cubic-bezier(0.16,1,0.3,1)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,203,5,0.22)';
              (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,203,5,0.12)';
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
          >
            {/* IKEA wordmark — blue text on yellow pill */}
            <span style={{
              fontSize: '0.6rem',
              fontWeight: 900,
              letterSpacing: '0.04em',
              color: '#003087',
              background: '#FFDB00',
              padding: '2px 5px',
              borderRadius: 4,
              lineHeight: 1,
              fontFamily: 'system-ui, sans-serif',
            }}>IKEA</span>
          </a>


        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="center-body" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flex: 1,
          gap: '1.5rem',
        }}>

          {/* ── LEFT: info ──────────────────────────────────────────── */}
          <div className="info-side" style={{ width: '44%', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>

            {/* Name */}
            <h1 className="title" style={{
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: 0,
              color: '#fff',
            }}>
              {product.name}
            </h1>

            {/* Category + color */}
            <p className="subtitle" style={{
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.48)',
              margin: 0,
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <span>{product.category ?? product.type}</span>
              <span style={{ opacity: 0.35 }}>•</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: activeColorHex,
                  border: '1px solid rgba(255,255,255,0.25)',
                  display: 'inline-block', flexShrink: 0,
                }} />
                <span style={{
                  maxWidth: '12ch', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {activeColorLabel || '—'}
                </span>
              </span>
            </p>

            {/* Rating */}
            <div className="rating" style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.82rem',
            }}>
              <span style={{ color: '#f5c518', letterSpacing: '0.05em' }}>
                {'★'.repeat(Math.round(displayRating))}{'☆'.repeat(5 - Math.round(displayRating))}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{displayRating.toFixed(1)}</span>
              <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.72rem' }}>
                {detailLoading ? '…' : displayReviewCount > 0 ? `(${displayReviewCount})` : ''}
              </span>
            </div>

            {/* Description */}
            <p className="desc" style={{
              fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.58)',
              lineHeight: 1.55,
              margin: 0,
            }}>
              {displayDescription || product.description}
            </p>

            {/* Designer + measurement */}
            <div className="designer" style={{
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.35)',
              lineHeight: 1.5,
            }}>
              Designer<br />
              <strong style={{ color: 'rgba(255,255,255,0.62)', fontWeight: 600 }}>{displayDesigner}</strong>
              {displayMeasurement && (
                <span style={{ marginLeft: '0.75rem' }}>
                  · <span style={{ color: 'rgba(255,255,255,0.45)' }}>{displayMeasurement}</span>
                </span>
              )}
            </div>

            {/* Color swatches — real API variants or static fallback */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.1rem', flexWrap: 'wrap' }}>
              {/* Base product swatch (always first) */}
              <button
                onClick={() => setActiveVariantIdx(-1)}
                title={product.name}
                className={`cp-spring-btn${activeVariantIdx === -1 ? ' cp-swatch-active' : ''}`}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: colorNameToHex((product as any).fullType ?? product.name),
                  border: '1.5px solid rgba(255,255,255,0.18)',
                  padding: 0, flexShrink: 0,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  outline: 'none',
                }}
              />
              {variantSwatches.length > 0
                ? variantSwatches.slice(0, 7).map(sw => (
                    <button
                      key={sw.id}
                      onClick={() => setActiveVariantIdx(sw.idx)}
                      title={sw.label}
                      className={`cp-spring-btn${activeVariantIdx === sw.idx ? ' cp-swatch-active' : ''}`}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: sw.hex,
                        border: '1.5px solid rgba(255,255,255,0.18)',
                        padding: 0, flexShrink: 0,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        outline: 'none',
                      }}
                    />
                  ))
                : SWATCHES.map((sw, i) => (
                    <button
                      key={sw.id}
                      onClick={() => setActiveVariantIdx(i)}
                      title={sw.label}
                      className={`cp-spring-btn${activeVariantIdx === i ? ' cp-swatch-active' : ''}`}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: sw.hex,
                        border: '1.5px solid rgba(255,255,255,0.18)',
                        padding: 0, flexShrink: 0,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        outline: 'none',
                      }}
                    />
                  ))
              }
              {detailLoading && (
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>loading…</span>
              )}
            </div>

            {/* Actions row: qty + add to cart */}
            <div className="actions" style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginTop: '0.2rem' }}>

              {/* Qty stepper */}
              <div className="qty" style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.38rem 0.75rem',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}>
                <SpringBtn
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '1rem', fontWeight: 300,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                >−</SpringBtn>
                <span style={{ minWidth: 22, textAlign: 'center', fontSize: '0.9rem', fontWeight: 600 }}>{qty}</span>
                <SpringBtn
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: '1rem', fontWeight: 300,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onClick={() => setQty(q => q + 1)}
                >+</SpringBtn>
              </div>

              {/* Add to cart */}
              <SpringBtn
                className={`cp-add-btn${addFlash ? ' cp-add-flash' : ''}`}
                onClick={handleAdd}
                style={{
                  padding: '0.55rem 1.5rem',
                  borderRadius: 999,
                  background: addFlash
                    ? 'rgba(99,220,130,0.28)'
                    : 'rgba(255,255,255,0.16)',
                  border: '1px solid ' + (addFlash ? 'rgba(99,220,130,0.55)' : 'rgba(255,255,255,0.22)'),
                  backdropFilter: 'blur(16px)',
                  color: addFlash ? '#6ee7b7' : '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 12px rgba(0,0,0,0.2)',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s, transform 0.25s cubic-bezier(0.16,1,0.3,1)',
                }}
              >
                {addFlash ? '✓ Added' : `Add to cart${qty > 1 ? ` (${qty})` : ''}`}
              </SpringBtn>
            </div>

            {/* Place it */}
            <SpringBtn
              className={`cp-place-btn${placeRipple ? ' cp-place-ripple' : ''}`}
              onClick={handlePlaceIt}
              style={{
                padding: '0.52rem 1.3rem',
                borderRadius: 999,
                background: 'rgba(99,160,255,0.14)',
                border: '1px solid rgba(99,160,255,0.32)',
                backdropFilter: 'blur(12px)',
                color: '#93c5fd',
                fontSize: '0.82rem',
                fontWeight: 600,
                letterSpacing: '0.01em',
                boxShadow: placeRipple ? '0 0 0 10px rgba(99,160,255,0)' : 'none',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                alignSelf: 'flex-start',
                transition: 'background 0.2s, border-color 0.2s, transform 0.25s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Place in room
            </SpringBtn>
          </div>

          {/* ── RIGHT: image + price ─────────────────────────────────── */}
          <div className="visual-side" style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'flex-end', justifyContent: 'center',
            position: 'relative', gap: '0.5rem',
          }}>
            {/* Price — floats top-right */}
            <div className="price" style={{
              position: 'absolute', top: -8, right: 0,
              fontSize: 'clamp(1.6rem, 3vw, 2.1rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#fff',
              textShadow: '0 2px 20px rgba(255,255,255,0.12)',
            }}>
              ${product.priceNum}
            </div>

            {/* Product image — parallax + levitate */}
            <div
              ref={imgRef}
              className="cp-img-wrap"
              onPointerMove={handleImgMove}
              onPointerEnter={() => setImgHover(true)}
              onPointerLeave={handleImgLeave}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                paddingTop: '1.5rem',
                cursor: 'default',
              }}
            >
              <div
                className={imgHover ? '' : 'cp-img-levitate'}
                style={{
                  transform: imgTransform,
                  transition: imgHover
                    ? 'transform 0.08s linear'
                    : 'transform 0.6s cubic-bezier(0.16,1,0.3,1)',
                  filter: imgHover
                    ? 'drop-shadow(0 24px 40px rgba(0,0,0,0.5))'
                    : 'drop-shadow(0 12px 28px rgba(0,0,0,0.38))',
                  willChange: 'transform',
                }}
              >
                <ProductImage
                  src={activeVariantImage || (product as any).imageUrl}
                  alt={activeVariantIdx >= 0 ? variantSwatches[activeVariantIdx]?.label ?? product.name : product.name}
                  className="product-img"
                  style={{ width: 'clamp(200px, 22vw, 270px)', objectFit: 'contain', display: 'block' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          marginTop: '0.5rem',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
            Article number<br />
            <strong style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
              {(product as any).articleNumber ?? 'BC773001'}
            </strong>
          </div>

          {/* Variant thumbnails — clicking selects variant + swaps main image */}
          <div className="thumbs" style={{ display: 'flex', gap: '0.4rem' }}>
            {/* Base product thumb — always shown */}
            <button
              key="base"
              onClick={() => setActiveVariantIdx(-1)}
              title={product.name}
              className={`cp-spring-btn cp-thumb${activeVariantIdx === -1 ? ' cp-swatch-active' : ''}`}
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: activeVariantIdx === -1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                border: '1px solid ' + (activeVariantIdx === -1 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)'),
                padding: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
              }}
            >
              {(product as any).imageUrl
                ? <img src={(product as any).imageUrl} alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <div style={{ width: 20, height: 20, borderRadius: '50%',
                    background: colorNameToHex((product as any).fullType ?? ''),
                    border: '1px solid rgba(255,255,255,0.2)' }} />
              }
            </button>
            {/* API variant thumbs */}
            {variantSwatches.slice(0, 3).map(sw => (
              <button
                key={sw.id}
                onClick={() => setActiveVariantIdx(sw.idx)}
                title={sw.label}
                className={`cp-spring-btn cp-thumb${activeVariantIdx === sw.idx ? ' cp-swatch-active' : ''}`}
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: activeVariantIdx === sw.idx ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                  border: '1px solid ' + (activeVariantIdx === sw.idx ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)'),
                  padding: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
                }}
              >
                {sw.imageUrl
                  ? <img src={sw.imageUrl} alt={sw.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }}
                      onError={e => {
                        const el = e.target as HTMLImageElement;
                        el.style.display = 'none';
                        // show a color circle fallback in the parent
                        el.parentElement!.innerHTML = `<div style="width:20px;height:20px;border-radius:50%;background:${sw.hex};border:1px solid rgba(255,255,255,0.2)"></div>`;
                      }} />
                  : <div style={{ width: 20, height: 20, borderRadius: '50%',
                      background: sw.hex,
                      border: '1px solid rgba(255,255,255,0.2)' }} />
                }
              </button>
            ))}
          </div>

          {/* Cart count pill */}
          {cartCount > 0 && (
            <div style={{
              fontSize: '0.68rem', fontWeight: 700,
              padding: '3px 10px', borderRadius: 999,
              background: 'rgba(99,102,241,0.18)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc',
            }}>
              🛒 {cartCount} in cart
            </div>
          )}
        </div>

      </div>
      </div>
    </>
  );
}