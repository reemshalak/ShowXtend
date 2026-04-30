/**
 * BrowsePage — Live IKEA catalog.
 * Sidenav is rendered via PersistentNav (all pages share the same nav).
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { Product } from './data';
import { PRODUCTS } from './data';
import { useRemoteAction } from './hooks/useRemoteAction';
import { getAllProducts, searchProducts, browseCategory } from './ikeaApi';
import PersistentNav from './components/PersistentNav';
import { openCompareWindow } from './openCompareWindow';
import { isXRMode } from './xrMode';
//@ts-ignore
import './css/BrowsePage.css';
import { ProductImage } from './components/productImage';

const CATEGORIES = ['All', 'Living Room', 'Bedroom', 'Kitchen', 'Workspace', 'Bathroom', 'Dining'];
const SORT_OPTIONS = ['Featured', 'Price: Low to High', 'Price: High to Low', 'Best Rated', 'Newest'];
const BROWSE_CHANNEL = 'browse-search-channel';

type CatalogProduct = Product & {
  category?: string;
  onSale?: boolean;
  isNew?: boolean;
  salePercent?: number;
  originalPrice?: number;
  reviewCount?: number;
  imageUrl?: string;
  ikeaUrl?: string;
};

export interface BrowsePageProps {
  onSelectProduct: (product: Product) => void;
  onWishlist: (product: Product) => void;
  cartCount: number;
  wishlistCount?: number;
  hasControl?: boolean;
  isCallActive?: boolean;
  broadcastAction?: (action: string, data?: any) => void;
  // Nav callbacks — passed from CenterPanelPage
  onOpenCart?: () => void;
  onOpenWishlist?: () => void;
  onOpenAssistant?: () => void;
  onOpenCollab?: () => void;
  onOpenLighting?: () => void;
  onOpenLayouts?: () => void;
}


function ProductThumb({ product }: { product: CatalogProduct }) {
  const url = (product as any).imageUrl;
  if (url) {
    return (
      <ProductImage
        src={url}
        alt={product.name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    );
  }
  return <span className="browse-card-emoji">{product.emoji ?? '🪑'}</span>;
}


export default function BrowsePage({
  onSelectProduct,
  onWishlist,
  cartCount,
  wishlistCount = 0,
  hasControl,
  isCallActive,
  broadcastAction,
  onOpenCart,
  onOpenWishlist,
  onOpenAssistant,
  onOpenCollab,
  onOpenLighting,
  onOpenLayouts,
}: BrowsePageProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortBy, setSortBy] = useState('Featured');
  const [showSort, setShowSort] = useState(false);
  const [search, setSearch] = useState('');
  const [wishlistedIds, setWishlistedIds] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiSource, setApiSource] = useState<'ikea' | 'local'>('local');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External search trigger (from Sheri)
  useEffect(() => {
    const ch = new BroadcastChannel(BROWSE_CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'search') setSearch(e.data.query ?? '');
    };
    return () => ch.close();
  }, []);

  // Pre-warm: single API fetch on mount — all products loaded once into memory
  useEffect(() => {
    setApiLoading(true);
    getAllProducts()
     .then((products: Product[]) =>  {
        const mapped = (products as CatalogProduct[]).map((p) => ({
          ...p,
          reviewCount: (p as any).reviewCount ?? Math.floor(Math.random() * 200 + 30),
        }));
        setCatalog(mapped);
        setApiSource((mapped[0] as any)?.ikeaId ? 'ikea' : 'local');
      })
      .catch(() => {
        setCatalog(PRODUCTS as CatalogProduct[]);
        setApiSource('local');
      })
      .finally(() => setApiLoading(false));
  }, []); // runs ONCE

  // Category / search — pure client-side after initial load, no more API calls
  const loadProducts = useCallback(async (cat: string, q: string) => {
    const products = (q.trim().length >= 2
      ? await searchProducts(q.trim(), 32)
      : await browseCategory(cat, 32)) as CatalogProduct[];
    setCatalog(products as CatalogProduct[]);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadProducts(activeCategory, search), 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeCategory, search, loadProducts]);

  useRemoteAction((action, data) => {
    if (action === 'select_product' && data?.productId) {
      const p = catalog.find((p) => p.id === data.productId);
      if (p) onSelectProduct(p);
    }
    if (action === 'add_to_wishlist' && data?.productId) {
      setWishlistedIds((prev) => {
        const n = new Set(prev);
        n.add(data.productId);
        return n;
      });
      const p = catalog.find((p) => p.id === data.productId);
      if (p) onWishlist(p);
    }
    if (action === 'browse_filter' && data?.category) setActiveCategory(data.category);
    if (action === 'browse_search' && data?.query !== undefined) setSearch(data.query);
  });

  const sorted = useMemo(() => {
    let list = [...catalog];
    if (sortBy === 'Price: Low to High')
      list.sort((a, b) => Number(a.priceNum) - Number(b.priceNum));
    if (sortBy === 'Price: High to Low')
      list.sort((a, b) => Number(b.priceNum) - Number(a.priceNum));
    if (sortBy === 'Best Rated') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return list;
  }, [catalog, sortBy]);

  const handleWishlist = (e: React.MouseEvent, p: CatalogProduct) => {
    e.stopPropagation();
    const next = new Set(wishlistedIds);
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    setWishlistedIds(next);
    onWishlist(p);
    broadcastAction?.('add_to_wishlist', { productId: p.id });
  };

  const handleSelect = (p: CatalogProduct) => {
    onSelectProduct(p);
    broadcastAction?.('select_product', { productId: p.id });
  };
  const handleCategory = (cat: string) => {
    setActiveCategory(cat);
    broadcastAction?.('browse_filter', { category: cat });
  };
  const handleSearch = (q: string) => {
    setSearch(q);
    broadcastAction?.('browse_search', { query: q });
  };

  return (
    <>
      <div className="browse-root">
        {/* ── For XR mode: Floating categories OUTSIDE panel ───────────────── */}
        {isXRMode && (
          <div className="browse-categories browse-categories--floating">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`browse-cat-pill ${activeCategory === cat ? 'browse-cat-pill--active' : ''}`}
                onClick={() => handleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* ── Persistent sidenav ────────────────────────────────────────────── */}
        <PersistentNav
          cartCount={cartCount}
          wishlistCount={wishlistCount}
          activeMode="browse"
          isCallActive={isCallActive}
          onBrowse={() => {}}
          onOpenCart={onOpenCart ?? (() => {})}
          onOpenWishlist={onOpenWishlist ?? (() => {})}
          onOpenAssistant={onOpenAssistant ?? (() => {})}
          onOpenCollab={onOpenCollab ?? (() => {})}
          onOpenLighting={onOpenLighting ?? (() => {})}
          onOpenLayouts={onOpenLayouts ?? (() => {})}
        />

        {/* ── Main panel ────────────────────────────────────────────────────── */}
        <div enable-xr className="spatial-panel browse-panel">
          {/* Header */}
          <div className="browse-header">
            <h2 className="browse-heading">Get inspired</h2>

            <div className="browse-search-wrap">
              <span className="browse-search-icon">🔍</span>
              <input
                className="browse-search-input"
                placeholder="Search catalog…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {search && (
                <button className="browse-search-clear" onClick={() => handleSearch('')}>
                  ✕
                </button>
              )}
            </div>

            <div className="browse-header-right">
              <div style={{ position: 'relative' }}>
                <button className="browse-sort-btn" onClick={() => setShowSort((v) => !v)}>
                  {sortBy} ↕
                </button>
                {showSort && (
                  <div className="browse-sort-dropdown spatial-panel">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        className={`browse-sort-option ${sortBy === opt ? 'browse-sort-option--active' : ''}`}
                        onClick={() => {
                          setSortBy(opt);
                          setShowSort(false);
                        }}
                      >
                        {sortBy === opt && '✓ '}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── For WEB mode: Categories INSIDE panel ───────────────────────── */}
          {!isXRMode && (
            <div className="browse-categories">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`browse-cat-pill ${activeCategory === cat ? 'browse-cat-pill--active' : ''}`}
                  onClick={() => handleCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="browse-results-row">
            <span className="browse-results-count">
              {apiLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.15)',
                      borderTopColor: '#60a5fa',
                      display: 'inline-block',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Loading catalog…
                </span>
              ) : (
                `${sorted.length} products found`
              )}
            </span>
            {hasControl && <span className="browse-control-badge">🎮 Syncing to all</span>}
          </div>

          {/* Grid — with staggered animations and glass design */}
          <div className="browse-grid">
            {!apiLoading &&
              sorted.map((product, idx) => (
                <div
                  key={product.id}
                  className={`browse-card ${hoveredId === product.id ? 'browse-card--hovered' : ''}`}
                  style={{ '--card-i': idx } as React.CSSProperties}
                  onClick={() => handleSelect(product)}
                  onMouseEnter={() => setHoveredId(product.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="browse-card-badges">
                    {product.onSale && (
                      <span className="browse-badge browse-badge--sale">-{product.salePercent}%</span>
                    )}
                    {product.isNew && <span className="browse-badge browse-badge--new">New</span>}
                  </div>

                  <div className="browse-card-image">
                    <ProductThumb product={product} />
                  </div>

                  <div
                    className={`browse-card-actions ${isXRMode || hoveredId === product.id ? 'browse-card-actions--visible' : ''}`}
                  >
                    {/* Compare button */}
                    <button
                      className="browse-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCompareWindow(product, 'left');
                      }}
                      title="Compare"
                    >
                      ⇄
                    </button>
                    {/* Wishlist button */}
                    <button
                      className={`browse-action-btn ${wishlistedIds.has(product.id) ? 'browse-action-btn--wishlisted' : ''}`}
                      onClick={(e) => handleWishlist(e, product)}
                      title="Wishlist"
                    >
                      {wishlistedIds.has(product.id) ? '♥' : '♡'}
                    </button>
                    {/* Quick view button */}
                    <button
                      className="browse-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(product);
                      }}
                      title="Quick view"
                    >
                      🔍
                    </button>
                    {/* IKEA link button */}
                    {(product as any).ikeaUrl && (
                      <button
                        className="browse-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open((product as any).ikeaUrl, '_blank');
                        }}
                        title="View on IKEA"
                      >
                        🔗
                      </button>
                    )}
                  </div>

                  <div className="browse-card-info">
                    <h3 className="browse-card-name">{product.name}</h3>
                    <p className="browse-card-type">{product.fullType}</p>
                    <div className="browse-card-rating">
                      <span className="browse-stars">
                        {'★'.repeat(Math.floor(product.rating ?? 4))}
                        {'☆'.repeat(5 - Math.floor(product.rating ?? 4))}
                      </span>
                      <span className="browse-rating-num">({product.reviewCount ?? 0})</span>
                    </div>
                    <div className="browse-card-price-row">
                      <span className="browse-card-price">{product.price}</span>
                      {product.onSale && (product.originalPrice ?? 0) > 0 && (
                        <span className="browse-card-original">${product.originalPrice}</span>
                      )}
                      <span className="browse-card-unit">/ piece</span>
                    </div>
                  </div>
                </div>
              ))}

            {/* Skeleton loaders */}
            {apiLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="browse-card"
                  style={{ pointerEvents: 'none', '--card-i': i } as React.CSSProperties}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.06)',
                    }}
                  />
                  <div className="browse-card-info">
                    <div
                      style={{
                        height: 14,
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.07)',
                        marginBottom: 6,
                        width: '70%',
                      }}
                    />
                    <div
                      style={{
                        height: 11,
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)',
                        width: '50%',
                      }}
                    />
                  </div>
                </div>
              ))}

            {!apiLoading && sorted.length === 0 && (
              <div className="browse-empty">
                <p>No products found</p>
                <button
                  className="browse-cat-pill browse-cat-pill--active"
                  onClick={() => {
                    handleSearch('');
                    handleCategory('All');
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {apiSource === 'ikea' && (
            <div
              style={{
                textAlign: 'center',
                padding: '0.5rem',
                fontSize: '0.58rem',
                color: 'rgba(255,255,255,0.18)',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                marginTop: '0.5rem',
              }}
            >
              Product data from IKEA · prices may vary
            </div>
          )}
        </div>
      </div>
    </>
  );
}