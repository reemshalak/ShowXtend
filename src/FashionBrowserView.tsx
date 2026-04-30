/**
 * FashionBrowserView.tsx (now FurnitureBrowser)
 * Shows IKEA search results in a 3D carousel
 * Fully syncs with main app cart, wishlist, and product selection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isXRMode } from './xrMode';
import { generateTripo3DModel } from './tripo3d';
import { ProductImage } from './components/productImage';

// ─── Channel names (must match rest of app) ───────────────────────────────
const CART_CHANNEL = 'cart-channel';
const WISHLIST_CHANNEL = 'wishlist-channel';
const ACTION_CHANNEL = 'assistant-action';
const PRODUCT_CHANNEL = 'catalog-product-select';

// ─── Helper ─────────────────────────────────────────────────────────────────
function bc(channel: string, data: any) {
  try {
    const ch = new BroadcastChannel(channel);
    ch.postMessage(data);
    ch.close();
  } catch {}
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Product {
  id: number | string;
  name: string;
  price: string;
  priceNum?: number;
  emoji: string;
  imageUrl?: string;
  type?: string;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function getCardTransform(offset: number): React.CSSProperties {
  const abs = Math.abs(offset);
  if (abs === 0) return {
    transform: 'translateX(0px) scale(1) perspective(900px) rotateY(0deg)',
    opacity: 1, zIndex: 5,
  };
  if (abs === 1) return {
    transform: `translateX(${offset * 262}px) scale(0.82) perspective(900px) rotateY(${offset > 0 ? -9 : 9}deg)`,
    opacity: 0.7, zIndex: 4,
  };
  if (abs === 2) return {
    transform: `translateX(${offset * 232}px) scale(0.65) perspective(900px) rotateY(${offset > 0 ? -15 : 15}deg)`,
    opacity: 0.4, zIndex: 3,
  };
  return {
    transform: `translateX(${offset * 200}px) scale(0.5) perspective(900px) rotateY(0deg)`,
    opacity: 0, zIndex: 1,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FashionBrowserViewProps {
  onBack?: () => void;
}

export default function FashionBrowserView({ onBack }: FashionBrowserViewProps) {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get('data');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [liked, setLiked] = useState<Set<string | number>>(new Set());
  const [cartItems, setCartItems] = useState<Set<string | number>>(new Set());
  const [cartFlash, setCartFlash] = useState(false);
  const dragStartX = useRef<number | null>(null);
const [placeFlash, setPlaceFlash] = useState(false);

  // Parse search results from URL params
 // Parse search results from URL params
useEffect(() => {
  if (dataParam) {
    try {
      const { query, products: productData } = JSON.parse(decodeURIComponent(dataParam));
      setSearchQuery(query || 'Search results');
      setProducts(productData || []);
      
      // Initialize liked status from localStorage if needed
      const savedWishlist = localStorage.getItem('wishlist');
      if (savedWishlist) {
        try {
          const wishlistItems: any[] = JSON.parse(savedWishlist);
          const wishlistIds = new Set<string | number>(wishlistItems.map((item: any) => item.id));
          setLiked(wishlistIds);
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to parse furniture data', e);
      setProducts([]);
    }
  }
}, [dataParam]);


  // Set to middle product when products load
  useEffect(() => {
    if (products.length > 0) {
      setCurrent(Math.floor(products.length / 2));
    }
  }, [products]);

  // 🔥 Broadcast active product selection to main app (so AI knows what you're viewing)
  useEffect(() => {
    if (products.length > 0 && products[current]) {
      const activeProduct = products[current];
      bc(PRODUCT_CHANNEL, { type: 'select', productId: activeProduct.id ,  productName: activeProduct.name,  // 🔥 MUST HAVE THIS
      productPrice: activeProduct.price, });
      console.log('[FashionBrowser] Active product:', activeProduct.name);
    }
  }, [current, products]);

// Listen for cart/wishlist updates from main app
useEffect(() => {
  const handleCartUpdate = (e: MessageEvent) => {
    if (e.data?.type === 'state' && e.data?.items) {
      const cartProductIds = new Set<string | number>(e.data.items.map((item: any) => item.product?.id || item.id));
      setCartItems(cartProductIds);
    }
  };
  
  const cartChannel = new BroadcastChannel(CART_CHANNEL);
  cartChannel.onmessage = handleCartUpdate;
  
  return () => cartChannel.close();
}, []);

  const n = products.length;

  const prev = useCallback(() => setCurrent(c => (c - 1 + n) % n), [n]);
  const next = useCallback(() => setCurrent(c => (c + 1) % n), [n]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  // 🔥 Toggle wishlist with broadcast
  const toggleLike = (id: string | number, product: Product) => {
    const isLiked = liked.has(id);
    
    if (!isLiked) {
      // Add to wishlist via BroadcastChannel
      bc(WISHLIST_CHANNEL, { type: 'add', productId: id });
      bc(ACTION_CHANNEL, { type: 'add_to_wishlist', productId: id });
    }
    
    setLiked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 🔥 Add to cart with broadcast
  const addToCart = () => {
    const currentProduct = products[current];
    if (currentProduct) {
      // Broadcast to cart channel
      bc(CART_CHANNEL, { type: 'add', productId: currentProduct.id });
      bc(ACTION_CHANNEL, { type: 'add_to_cart', productId: currentProduct.id });
      
      setCartItems(prev => new Set(prev).add(currentProduct.id));
      setCartFlash(true);
      setTimeout(() => setCartFlash(false), 1200);
    }
  };

  // Add this with other functions
const placeInRoom = async () => {
  const currentProduct = products[current];
  if (currentProduct) {
    setPlaceFlash(true);
    setTimeout(() => setPlaceFlash(false), 1200);
    
    if (isXRMode) {
      // Generate or get model URL
      let modelUrl = null;
      try {
        const url = await generateTripo3DModel(
          currentProduct.imageUrl ?? '',
          () => {},
          { xrMode: true }
        );
        modelUrl = url;
      } catch (err) {
        console.warn('[FashionBrowser] Failed to generate model:', err);
      }
      
      // Open XR window with model
      const objData = encodeURIComponent(JSON.stringify({
        id: currentProduct.id,
        type: 'product',
        emoji: currentProduct.emoji || '🪑',
        label: currentProduct.name,
        color: '#c8b89a',
        transform: {
          position: { x: 0, y: 0, z: -1.5 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      }));
      
      const winName = `xr-model-${currentProduct.id}-${Date.now()}`;
      const url = modelUrl 
        ? `/xr-model?data=${objData}&modelUrl=${encodeURIComponent(modelUrl)}`
        : `/xr-model?data=${objData}`;
      
      window.open(url, winName);
    } else {
      // Web mode - broadcast to main app
      bc(ACTION_CHANNEL, { 
        type: 'place_it', 
        productId: currentProduct.id 
      });
    }
  }
};
  // Drag / swipe
  const onPointerDown = (e: React.PointerEvent) => { dragStartX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(dx) > 48) { dx < 0 ? next() : prev(); }
  };

  const rootStyle: React.CSSProperties = isXRMode ? {
    // XR: fill the spatial window frame cleanly, transparent bg for visionOS glass
    position: 'fixed',
    inset: 0,
    width: 'auto',
    height: 'auto',
    overflow: 'hidden',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    background: 'transparent',
    color: '#FAF7F2',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
    boxSizing: 'border-box' as const,
  } : {
    position: 'relative',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    background: '#1a1714',
    color: '#FAF7F2',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  };

  if (n === 0) {
    return (
      <div style={rootStyle}>
        <div style={{ textAlign: 'center', paddingTop: '20vh' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🪑</div>
          <h2>No products found for "{searchQuery}"</h2>
          <button onClick={onBack} style={{ marginTop: '2rem', padding: '0.5rem 1.5rem', borderRadius: 999, background: '#FAF7F2', color: '#1C1A18', border: 'none', cursor: 'pointer' }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div {...(isXRMode ? { 'enable-xr': true } : {})} style={rootStyle}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}>

      {/* Background atmosphere — web only, XR uses native glass material */}
      {!isXRMode && <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 80% 60% at 50% 30%, #2d2420 0%, transparent 70%),
          radial-gradient(ellipse 60% 80% at 20% 80%, #261f1a 0%, transparent 60%),
          radial-gradient(ellipse 50% 60% at 80% 70%, #1e1c18 0%, transparent 60%)
        `,
      }} />}

      {/* Side panels — web only, they're opaque dark bars that clip XR content */}
      {!isXRMode && <>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:120, zIndex:0, pointerEvents:'none',
          background:'linear-gradient(90deg, #0d0c0a 0%, #2a1f15 40%, transparent 100%)',
          borderRight:'1px solid rgba(255,255,255,0.04)' }} />
        <div style={{ position:'absolute', right:0, top:0, bottom:0, width:120, zIndex:0, pointerEvents:'none',
          background:'linear-gradient(270deg, #0d0c0a 0%, #2a1f15 40%, transparent 100%)',
          borderLeft:'1px solid rgba(255,255,255,0.04)' }} />
      </>}

      {/* Back button */}
      {onBack && (
        <button onClick={onBack} style={{
          position:'absolute', top:18, left: isXRMode ? 16 : 140, zIndex:20,
          width:38, height:38, borderRadius:'50%',
          background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)',
          color:'white', fontSize:16, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          backdropFilter:'blur(12px)',
        }}>←</button>
      )}

      {/* Search query display */}
      {searchQuery && (
        <div style={{
          position:'absolute', top:18, left: '50%', transform: 'translateX(-50%)',
          zIndex:20,
          background:'rgba(255,255,255,0.1)',
          border:'1px solid rgba(255,255,255,0.15)',
          borderRadius:999,
          padding:'6px 16px',
          fontSize:12,
          backdropFilter:'blur(12px)',
        }}>
          🔍 {n} result{n !== 1 ? 's' : ''} for: {searchQuery}
        </div>
      )}

      {/* Main carousel zone */}
      <div style={{
        flex:1, position:'relative', display:'flex',
        alignItems:'center', justifyContent:'center', overflow:'hidden',
      }}>

        {/* Prev / Next buttons */}
        {n > 1 && (
          <>
            <button onClick={prev} style={{
              position:'absolute', left: isXRMode ? 12 : 140, top:'50%', transform:'translateY(-50%)',
              width:44, height:44, borderRadius:'50%',
              background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)',
              color:'white', fontSize:16, cursor:'pointer', zIndex:10,
              display:'flex', alignItems:'center', justifyContent:'center',
              backdropFilter:'blur(12px)',
            }}>←</button>
            
            <button onClick={next} style={{
              position:'absolute', right: isXRMode ? 12 : 140, top:'50%', transform:'translateY(-50%)',
              width:44, height:44, borderRadius:'50%',
              background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)',
              color:'white', fontSize:16, cursor:'pointer', zIndex:10,
              display:'flex', alignItems:'center', justifyContent:'center',
              backdropFilter:'blur(12px)',
            }}>→</button>
          </>
        )}

        {/* Cards */}
        <div style={{
          position:'relative', width:'100%', height: isXRMode ? 340 : 420,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {products.map((p, i) => {
            const offset = i - current;
            const txStyle = getCardTransform(offset);
            const isActive = i === current;

            return (
              <div key={p.id}
                onClick={() => { if (!isActive) setCurrent(i); }}
                style={{
                  position:'absolute',
                  width: isXRMode ? 220 : 280,
                  height: isXRMode ? 340 : 420,
                  borderRadius: isXRMode ? 28 : 20,
                  // visionOS: brighter glass with stronger border for legibility
                  background: isXRMode
                    ? (isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)')
                    : (isActive ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)'),
                  border: isXRMode
                    ? `1px solid ${isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)'}`
                    : `1px solid ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                  backdropFilter: isXRMode ? 'blur(60px) saturate(1.8)' : 'blur(20px)',
                  cursor: isActive ? 'default' : 'pointer',
                  overflow:'hidden',
                  boxShadow: isActive
                    ? (isXRMode ? '0 20px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' : '0 40px 80px rgba(0,0,0,0.5)')
                    : 'none',
                  transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1), opacity 0.55s cubic-bezier(0.4,0,0.2,1)',
                  ...txStyle,
                }}>

                {/* Image zone */}
                <div style={{
                  width:'100%', height:'72%', position:'relative',
                  display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
                }}>
                  <div style={{
                    position:'absolute', inset:0,
                    background:'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.07) 0%, transparent 70%)',
                  }} />

                  {p.imageUrl ? (
                    <ProductImage
                          src={p.imageUrl} alt={p.name} style={{
                      height:'90%', width:'auto', objectFit:'contain', position:'relative', zIndex:1,
                      transform: isActive ? 'scale(1.06) translateY(-8px)' : 'scale(1)',
                      transition:'transform 0.4s ease',
                      filter:'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
                    }} />
                  ) : (
                    <div style={{
                      fontSize:130, lineHeight:1, position:'relative', zIndex:1,
                      transform: isActive ? 'scale(1.06) translateY(-8px)' : 'scale(1)',
                      transition:'transform 0.4s ease',
                      filter:'drop-shadow(0 20px 40px rgba(0,0,0,0.4))',
                    }}>{p.emoji}</div>
                  )}

                  {/* AR badge */}
                  <div style={{
                    position:'absolute', bottom:12, left:'50%', transform:'translateX(-50%)',
                    background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
                    borderRadius:999, padding:'5px 10px',
                    fontSize:11, color:'rgba(255,255,255,0.8)',
                    display:'flex', alignItems:'center', gap:5,
                    backdropFilter:'blur(8px)', whiteSpace:'nowrap',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5">
                      <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
                      <path d="M12 22V12M2 7l10 5 10-5" />
                    </svg>
                    View in Room
                  </div>

                  {/* Heart button */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleLike(p.id, p); }}
                    style={{
                      position:'absolute', top:12, right:12,
                      width:34, height:34, borderRadius:'50%',
                      background: liked.has(p.id) ? 'rgba(212,83,126,0.3)' : 'rgba(255,255,255,0.12)',
                      border: `1px solid ${liked.has(p.id) ? 'rgba(212,83,126,0.5)' : 'rgba(255,255,255,0.2)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      cursor:'pointer', zIndex:2, backdropFilter:'blur(8px)',
                    }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={liked.has(p.id) ? '#d45a7e' : 'none'}
                      stroke={liked.has(p.id) ? '#d45a7e' : 'rgba(255,255,255,0.8)'} strokeWidth="1.8">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>

                {/* Card info */}
                <div style={{
                  padding:'14px 16px 16px', height:'28%',
                  display:'flex', flexDirection:'column', justifyContent:'space-between',
                }}>
                  <div style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize:15, fontWeight:400, lineHeight:1.3,
                    color:'rgba(255,255,255,0.9)',
                    overflow:'hidden', display:'-webkit-box',
                    WebkitLineClamp:2, WebkitBoxOrient:'vertical',
                  }}>{p.name}</div>
                  <div style={{ fontSize:16, fontWeight:500, color:'#FAF7F2', marginTop:4 }}>
                    {p.price}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dot pagination */}
        {n > 1 && (
          <div style={{
            position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)',
            display:'flex', gap:5, zIndex:20,
          }}>
            {products.map((_, i) => (
              <div key={i}
                onClick={() => setCurrent(i)}
                style={{
                  height:5, borderRadius:3,
                  width: i === current ? 18 : 5,
                  background: i === current ? 'white' : 'rgba(255,255,255,0.25)',
                  cursor:'pointer', transition:'all 0.3s ease',
                }} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding: isXRMode ? '12px 16px' : '14px 160px',
        borderTop: isXRMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
        background: isXRMode ? 'rgba(255,255,255,0.08)' : 'rgba(20,17,14,0.85)',
        backdropFilter:'blur(20px)',
        gap: isXRMode ? 8 : 0,
      }}>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
          {products.length} product{products.length !== 1 ? 's' : ''}
        </div>

        <button onClick={addToCart} style={{
          flex:1, maxWidth: isXRMode ? 'none' : 340,
          height: isXRMode ? 44 : 46,
          borderRadius:999,
          background: cartFlash
            ? (isXRMode ? 'rgba(184,221,184,0.3)' : '#b8ddb8')
            : (isXRMode ? 'rgba(255,255,255,0.18)' : '#FAF7F2'),
          color: isXRMode ? '#fff' : '#1C1A18',
          border: isXRMode ? '1px solid rgba(255,255,255,0.35)' : 'none',
          fontSize:14, fontWeight:isXRMode ? 600 : 500, cursor:'pointer',
          transition:'all 0.25s ease',
          margin: isXRMode ? 0 : '0 auto',
          backdropFilter: isXRMode ? 'blur(20px)' : 'none',
          letterSpacing: isXRMode ? '0.01em' : 0,
        }}>
          {cartFlash ? '✓ Added!' : 'Add to Cart'}
        </button>
        <button onClick={placeInRoom} style={{
          flex:1, maxWidth: isXRMode ? 'none' : 340,
          height: isXRMode ? 44 : 46,
          borderRadius:999,
          background: placeFlash
            ? (isXRMode ? 'rgba(184,221,184,0.3)' : '#b8ddb8')
            : (isXRMode ? 'rgba(255,255,255,0.18)' : '#FAF7F2'),
          color: isXRMode ? '#fff' : '#1C1A18',
          border: isXRMode ? '1px solid rgba(255,255,255,0.35)' : 'none',
          fontSize:14, fontWeight:isXRMode ? 600 : 500, cursor:'pointer',
          transition:'all 0.25s ease',
          margin: isXRMode ? 0 : '0 auto',
          backdropFilter: isXRMode ? 'blur(20px)' : 'none',
          letterSpacing: isXRMode ? '0.01em' : 0,
        }}>
          View in 3D
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'rgba(255,255,255,0.5)' }}>
          <span style={{ fontSize:16 }}>🛒</span>
          <span>{cartItems.size} item{cartItems.size !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
      `}</style>
    </div>
  );
}