/**
 * CenterPanelPage — Root orchestrator.
 *
 * CRITICAL FIXES:
 *
 * A. PICO control sync:
 *    On PICO, joinSession() is called inside the /collab popup window, which has
 *    its own JS context — getSession() in THIS window is always null.
 *    Fix: /collab broadcasts SESSION_CHANNEL when it joins. This window listens,
 *    calls joinSession() itself → gets its own WebSocket to the same room →
 *    control_action events now arrive and applyActionRef.current() applies them.
 *
 * B. Camera re-prompt on every action:
 *    FloatingCallOverlay was inside inline `Overlays` component. Every re-render
 *    (hasControl toggle etc) created a new component type → unmount+remount →
 *    getUserMedia fired again. Fix: render FloatingCallOverlay at top level only.
 *
 * C. Cart: inline CartPanel drawer with qty controls + checkout.
 *
 * D. Session alive across mode changes. Only disconnects on explicit End Call.
 *
 * E. [FIX] Assistant iframe actions now wired end-to-end:
 *    The assistant runs in <iframe src="/assistant"> — its own JS context.
 *    assistantActions.ts posts BroadcastChannel messages that CenterPanelPage
 *    was not listening for. Now all channels are fully handled:
 *      CART_CHANNEL     → add / remove / open
 *      ACTION_CHANNEL   → place_it, open_cart, open_wishlist, open_collab,
 *                         clear_scene, remove_last, add_to_wishlist
 *      PRODUCT_CHANNEL  → select (already worked, kept)
 *      LIGHTING_CHANNEL → preset change
 *      BROWSE_CHANNEL   → search query forwarded to BrowsePage
 */

import { useEffect, useRef, useState } from 'react';
import { initScene } from '@webspatial/react-sdk';
import { isXRMode } from './xrMode';
import { PRODUCTS, type Product } from './data';
import BrowsePage from './BrowsePage';
import CenterPanel from './CenterPanel';
import LeftPanel from './LeftPanel';
import PlaceItView from './PlaceItView';
import CollabSessionPage from './CollabSessionPage';
import FloatingCallOverlay from './FloatingCallOverlay';
import FloatingAssistant from './FloatingAssistant';
//@ts-ignore
import WishlistPanel from './Wishlistpanel';
import CartPanel from './CartPanel';
import { SharedSceneManager } from './SharedSceneManager';
import { getSession, joinSession } from './collaboration';
import { makeObject, sceneStore } from './sceneStore';
import LayoutManager from './LayoutManager';
import Shared3DScene from './Shared3DScene';
import AISceneTips from './AISceneTips';
import { broadcastObject, broadcastScene } from './Xrwindowbridge';
import { generateTripo3DModel, Tripo3DStatus } from './tripo3d';

const PRODUCT_CHANNEL   = 'catalog-product-select';
const WISHLIST_CHANNEL  = 'wishlist-channel';
const ACTION_CHANNEL    = 'assistant-action';
const SESSION_CHANNEL   = 'session-join-channel';
const CART_CHANNEL      = 'cart-channel';
const LIGHTING_CHANNEL  = 'lighting-channel';
const BROWSE_CHANNEL    = 'browse-search-channel';
const LEFT_WINDOW       = 'catalog-left-panel';
const RIGHT_WINDOW      = 'catalog-right-panel';
const ASSISTANT_WINDOW  = 'catalog-assistant';
const LIGHTING_WINDOW   = 'catalog-lighting';
const COLLAB_WINDOW     = 'catalog-collab';
const XR_TOOLBAR_WINDOW = 'xr-toolbar';

const CENTER_W = 620;
const LEFT_W   = 260;
const LEFT_H   = 680;
const RIGHT_W  = 260;
const RIGHT_H  = 600;
const GAP      = 60;
type Mode = 'browse' | 'catalog' | 'place-it';
interface CartItem { product: Product; qty: number; }

function playTone(freq: number, dur: number, vol = 0.15) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch {}
}
const sfx = {
  join:    () => { playTone(660, 0.12); setTimeout(() => playTone(880, 0.15), 120); },
  granted: () => { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.18), 200); },
  leave:   () => { playTone(440, 0.1); setTimeout(() => playTone(330, 0.18), 100); },
};

export default function CenterPanelPage() {
  const [selected, setSelected]               = useState<Product>(PRODUCTS[2]);
  const [mode, setMode]                       = useState<Mode>('browse');
  const [showCollabLobby, setShowCollabLobby] = useState(false);
  const [callActive, setCallActive]           = useState(false);
  const [callRoomCode, setCallRoomCode]       = useState('');
  const [hasControl, setHasControl]           = useState(false);
  const [showAssistant, setShowAssistant]     = useState(false);
  const [showWishlist, setShowWishlist]       = useState(false);
  const [showCart, setShowCart]               = useState(false);
  const [showLayouts, setShowLayouts]         = useState(false);
  const [wishlistItems, setWishlistItems]     = useState<Product[]>([]);
  const [cartItems, setCartItems]             = useState<CartItem[]>([]);
  const [controlGivenTo, setControlGivenTo]   = useState<string | null>(null);
  const [controlledBy, setControlledBy]       = useState<string | null>(null);
  const [isGeneratingTripo, setIsGeneratingTripo] = useState(false);
const assistantWindowRef = useRef(false);


  
  const [budget, setBudget] = useState(() => {
    try { return Number(localStorage.getItem('shopping_budget') ?? '0'); } catch { return 0; }
  });

  // Tripo3D cache for PICO direct placement
  const tripoCache = new Map<number, { status: string; url: string | null }>();


  const leftWindowRef      = useRef<Window | null>(null);
  const openPanels         = useRef<Map<string, Window | null>>(new Map());
  const sceneManager       = useRef<SharedSceneManager | null>(null);
  const applyActionRef     = useRef<(action: string, data?: any) => void>(() => {});
  const attachedSessionRef = useRef<any>(null);
  const unsubRef           = useRef<(() => void) | null>(null);
  // Keep latest cartItems/wishlistItems accessible in channel callbacks without stale closure
  const cartItemsRef       = useRef<CartItem[]>([]);
  const wishlistItemsRef   = useRef<Product[]>([]);
  const selectedRef        = useRef<Product>(PRODUCTS[2]);
  const budgetRef          = useRef<number>(0);

  useEffect(() => { cartItemsRef.current    = cartItems;    }, [cartItems]);
  useEffect(() => { wishlistItemsRef.current = wishlistItems; }, [wishlistItems]);
  useEffect(() => { selectedRef.current     = selected;     }, [selected]);
  useEffect(() => { budgetRef.current       = budget;       }, [budget]);

  useEffect(() => {
    if (!isXRMode) return;
    sceneManager.current = new SharedSceneManager();
  }, []);


  
  // ── Helpers ──────────────────────────────────────────────────────────────────
  function openOnDemand(name: string, url: string, size: { width: number; height: number }, pos: { x: number; y: number; z: number }) {
    const existing = openPanels.current.get(name);
    if (existing && !existing.closed) return;
    if (isXRMode) initScene(name, (cfg) => ({ ...cfg, defaultSize: size, defaultPosition: pos }));
    openPanels.current.set(name, window.open(url, name));
  }

const openAssistant = () => {
  if (isXRMode) {
    
    openOnDemand(
      ASSISTANT_WINDOW, 
      '/assistant', 
      {width: 600, height: 900}, 
      { 
       x: -400, y: 0, z: 0
      }
    );
  } else {
    setShowAssistant(true);
  }
};

// ── XR Window helpers for PersistentNav buttons ──────────────────────────────
const openCartWindow = () => {
  if (isXRMode) {
    openOnDemand(
      'cart-window',
      '/cart',
    { width: 340, height: 480 }, { x: 0, y: -420, z: 0 }
    );
  } else {
    setShowCart(true);
  }
};

const openWishlistWindow = () => {
  if (isXRMode) {
    openOnDemand('wishlist-window', '/wishlist', { width: 360, height: 520 }, { x: CENTER_W/2 + GAP + RIGHT_W/2 + 200, y: -100, z: 0 });
  } else {
    setShowWishlist(true);
  }
};


  const openLighting = () => openOnDemand(LIGHTING_WINDOW, '/lighting', { width: 300, height: 420 }, { x: CENTER_W/2+GAP+RIGHT_W/2, y: 380, z: 0 });
  const openCollab   = () => {
    if (isXRMode) openOnDemand(COLLAB_WINDOW, '/collab', { width: 340, height: 480 }, { x: 0, y: -420, z: 0 });
    else setShowCollabLobby(v => !v);
  };

  // ── Cart helpers ─────────────────────────────────────────────────────────────
  const addToCart = (product: Product) =>
    setCartItems(prev => {
      const ex = prev.find(i => i.product.id === product.id);
      return ex
        ? prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { product, qty: 1 }];
    });
  const updateQty      = (id: number, qty: number) => setCartItems(prev => prev.map(i => i.product.id === id ? { ...i, qty } : i));
  const removeFromCart = (id: number) => setCartItems(prev => prev.filter(i => i.product.id !== id));
  const cartCount      = cartItems.reduce((s, i) => s + i.qty, 0);

  const addToWishlist = (product: Product) =>
    setWishlistItems(prev => prev.find(p => p.id === product.id) ? prev : [...prev, product]);

  // ── applyAction — updated every render via ref ────────────────────────────────
  const applyAction = async (action: string, data?: any) => {
    switch (action) {
      case 'select_product':  { const p = PRODUCTS.find(p => p.id === data?.productId); if (p) { setSelected(p); setMode('catalog'); } break; }
      case 'browse':          setMode('browse'); break;
      case 'add_to_cart':     { const p = PRODUCTS.find(p => p.id === data?.productId); if (p) addToCart(p); break; }
case 'place_it':
  if (isXRMode) {
    const p = data?.productId
      ? PRODUCTS.find(p => p.id === data.productId)
      : selectedRef.current;
    if (p) await placeProductInXR(p);
    return;
  }
  setMode('place-it');
  break;
      case 'back_to_catalog': setMode('catalog'); break;
      case 'back_to_browse':  setMode('browse'); break;
      case 'add_to_wishlist': { const p = PRODUCTS.find(p => p.id === data?.productId); if (p) addToWishlist(p); break; }
      case 'open_assistant':  openAssistant(); break;
      case 'open_lighting':   openLighting(); break;
      case 'open_collab':     openCollab(); break;
      case 'open_cart':       openCartWindow(); break;
      case 'open_wishlist':   openWishlistWindow(); break;
      case 'remove_from_cart':{ removeFromCart(data?.productId); break; }
    }
  };


// WISHLIST SYNC 

  useEffect(() => {
  const ch = new BroadcastChannel(WISHLIST_CHANNEL);
  ch.postMessage({ 
    type: 'state', 
    items: wishlistItems 
  });
  ch.close();
}, [wishlistItems]);

// CALL_CHANNEL SYNC FOR FLOATING ASSISTANT STANDALONE
useEffect(() => {
  const ch = new BroadcastChannel('call-channel');
  ch.onmessage = (e) => {
    if (e.data?.type === 'open_collab') {
      openCollab();
    }
  };
  return () => ch.close();
}, []);


  useEffect(() => { applyActionRef.current = applyAction; }); // runs every render — intentional

  // ── Session listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = setInterval(() => {
      const session = getSession();
      if (!session) {
        if (attachedSessionRef.current) {
          unsubRef.current?.(); unsubRef.current = null; attachedSessionRef.current = null;
          setHasControl(false); setControlGivenTo(null); setControlledBy(null);
        }
        return;
      }
      if (session === attachedSessionRef.current) return;

      unsubRef.current?.();
      attachedSessionRef.current = session;

      unsubRef.current = session.onEvent((event) => {
        if ((event as any).type === 'control_action') {
          applyActionRef.current((event as any).action, (event as any).data);
          return;
        }
        if (event.type === 'control_granted') {
          if (event.grantedTo === session.participantId) { setHasControl(true); sfx.granted(); }
          else { const p = session.participants.get(event.grantedTo); setControlGivenTo(p?.name ?? 'participant'); }
        }
        if (event.type === 'control_revoked') { setHasControl(false); setControlGivenTo(null); setControlledBy(null); }
        if (event.type === 'request_control') setControlledBy((event as any).fromName);
        if (event.type === 'participant_join') sfx.join();
        if (event.type === 'participant_leave') sfx.leave();
      });
    }, 300);

    return () => { clearInterval(poll); unsubRef.current?.(); unsubRef.current = null; attachedSessionRef.current = null; };
  }, []);

  // ── FIX A: Mirror-join ────────────────────────────────────────────────────────
// useEffect(() => {
//   const ch = new BroadcastChannel(SESSION_CHANNEL);
  
//   ch.onmessage = async (e) => {
//     if (e.data?.type !== 'session_joined') return;
    
//       // 🔥 Skip mirror-join on PICO to prevent duplicates
//     if (isXRMode) {
//       console.log('[CenterPanel] Skipping mirror-join in XR mode');
//       return;
//     }

//     const existing = getSession();
//     if (existing && existing.roomCode === e.data.roomCode) return;
    
//     console.log('[CenterPanel] Mirror-joining room:', e.data.roomCode);
    
//     try {
//       // Join with a slightly different name so PICO user list shows both
//       await joinSession(e.data.roomCode, `${e.data.name} (Viewer)`);
//       console.log('[CenterPanel] Mirror join success');
      
//       // Also update call state
//       setCallRoomCode(e.data.roomCode);
//       setCallActive(true);
//     } catch (err) {
//       console.warn('[CenterPanel] Mirror join failed:', err);
//     }
//   };
  
//   return () => ch.close();
// }, []);


  // ── [FIX E] CART CHANNEL — full two-way ──────────────────────────────────────
  // The assistant iframe posts 'add', 'remove', 'open' — we now handle all of them.
  // We also push 'sync' so the assistant always knows current cart + budget state.

// ── FIX A: Mirror-join ────────────────────────────────────────────────────────
useEffect(() => {
  const ch = new BroadcastChannel(SESSION_CHANNEL);
  
  ch.onmessage = async (e) => {
    if (e.data?.type !== 'session_joined') return;
    
    const existing = getSession();
    if (existing && existing.roomCode === e.data.roomCode) {
      console.log('[CenterPanel] Already in this room, skipping duplicate join');
      return;
    }
    
    console.log('[CenterPanel] Mirror-joining room:', e.data.roomCode);
    
    try {
      // Join with same name (or slightly different)
      await joinSession(e.data.roomCode, e.data.name);
      console.log('[CenterPanel] Mirror join success');
      
      setCallRoomCode(e.data.roomCode);
      setCallActive(true);
    } catch (err) {
      console.warn('[CenterPanel] Mirror join failed:', err);
    }
  };
  
  return () => ch.close();
}, []);

  useEffect(() => {
    const ch = new BroadcastChannel(CART_CHANNEL);

    ch.onmessage = (e) => {
      const { type, productId, items } = e.data ?? {};

      if (type === 'add') {
        // productId may be from live IKEA catalog (not in PRODUCTS) so check cartItemsRef too
        const p = PRODUCTS.find(p => p.id === productId)
               ?? cartItemsRef.current.find(i => i.product.id === productId)?.product
               ?? selectedRef.current;  // fallback: currently viewed product
        if (p) addToCart(p);
      }

      if (type === 'remove') {
        if (productId === -1) {
          // -1 = "remove last item" signal from localRouter
          setCartItems(prev => prev.slice(0, -1));
        } else {
          removeFromCart(productId);
        }
      }

      if (type === 'open') {
        setShowCart(true);
      }

      if (type === 'sync') {
        // Assistant pushed its own cart snapshot — merge in (rare but handle it)
        if (Array.isArray(items)) {
          items.forEach((item: CartItem) => addToCart(item.product));
        }
      }
    };

    // Push current state to assistant on an interval so it always has fresh data
    const push = () => {
      ch.postMessage({
        type:          'state',
        items:         cartItemsRef.current,
        wishlist:      wishlistItemsRef.current,
        budget:        budgetRef.current,
        selectedId:    selectedRef.current.id,
        selectedName:  selectedRef.current.name,
        selectedPrice: selectedRef.current.priceNum,
      });
    };

    push(); // immediate push on mount
    const interval = setInterval(push, 2000);

    return () => { ch.close(); clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // no deps — uses refs for live values

  // ── [FIX E] ACTION CHANNEL — full coverage ────────────────────────────────────
  useEffect(() => {
    const ch = new BroadcastChannel(ACTION_CHANNEL);

    ch.onmessage = (e) => {
      const { type, productId, query } = e.data ?? {};

      switch (type) {
        // Already handled before fix:
        case 'open_assistant': openAssistant(); break;
        case 'open_lighting':  openLighting();  break;
        case 'open_collab':    openCollab();    break;

        // NEW — assistant actions:
        case 'open_cart':      setShowCart(true);     break;
        case 'open_wishlist':  setShowWishlist(true);  break;

        case 'place_it': {
          // Optionally switch to the product the assistant is talking about
          if (productId) {
            const p = PRODUCTS.find(p => p.id === productId);
            if (p) setSelected(p);
          }
          setMode('place-it');
          break;
        }

        case 'add_to_wishlist': {
          const p = PRODUCTS.find(p => p.id === productId) ?? selectedRef.current;
          if (p) addToWishlist(p);
          break;
        }

        case 'remove_last': {
          // Remove most recently placed scene object
          const objs = sceneStore.getObjects();
          if (objs.length > 0) sceneStore.deleteObject(objs[objs.length - 1].id);
          break;
        }

        case 'clear_scene': {
          sceneStore.getObjects().forEach(o => sceneStore.deleteObject(o.id));
          break;
        }

        case 'select_product': {
          const p = PRODUCTS.find(p => p.id === productId);
          if (p) { setSelected(p); setMode('catalog'); }
          break;
        }

        case 'browse_search': {
          try {
            const bc = new BroadcastChannel(BROWSE_CHANNEL);
            bc.postMessage({ type: 'search', query });
            bc.close();
          } catch {}
          setMode('browse');
          break;
        }

        case 'go_home':
          setMode('browse');
          break;
      }
    };

    return () => ch.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── [FIX E] LIGHTING CHANNEL — forward lighting changes from assistant ────────
  // (LightingPage already listens on this channel — we just need to also apply
  //  the change locally for the scene background if needed)
  useEffect(() => {
    const ch = new BroadcastChannel(LIGHTING_CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'lighting' && e.data.preset) {
        // Relay to collab session so remote peers also get the lighting change
        getSession()?.send({ type: 'lighting_change', preset: e.data.preset, floor: '', wall: '' });
      }
    };
    return () => ch.close();
  }, []);

  // // ── [FIX E] PRODUCT CHANNEL — assistant select_product + existing XR usage ────
  // useEffect(() => {
  //   const ch = new BroadcastChannel(PRODUCT_CHANNEL);
  //   ch.onmessage = (e) => {
  //     if (e.data?.type === 'select' && e.data.productId != null) {
  //       const p = PRODUCTS.find(p => p.id === e.data.productId);
  //       if (p) { setSelected(p); setMode('catalog'); }
  //     }
  //   };
  //   return () => ch.close();
  // }, []);

  // ── [FIX E] PRODUCT CHANNEL — assistant select_product + existing XR usage ────
// ── [FIX E] PRODUCT CHANNEL — assistant select_product + existing XR usage ────
useEffect(() => {
  const ch = new BroadcastChannel(PRODUCT_CHANNEL);
  ch.onmessage = async (e) => {
    console.log('[CenterPanel] PRODUCT_CHANNEL received:', e.data);
    if (e.data?.type === 'select' && e.data.productId != null) {
      // First try to find in local PRODUCTS
      let p = PRODUCTS.find(p => p.id === e.data.productId);
      
      // If not found, try to load from IKEA API
      if (!p) {
        try {
          const { getProductDetails } = await import('./ikeaApi');
          const detail = await getProductDetails(String(e.data.productId));
          if (detail) {
            // Create a Product-like object from detail
            p = {
              id: e.data.productId,
              name: detail.productName,
              price: `$${detail.productPrice}`,
              priceNum: detail.productPrice,
              emoji: '🪑',
              type: 'Furniture',
              fullType: detail.productName,
              description: detail.description,
              rating: detail.rating.average,
              designer: detail.designerName,
              imageUrl: detail.gallery?.[0],
              category: 'Furniture',
            } as Product;
          }
        } catch (err) {
          console.warn('[CenterPanel] Failed to load product details:', err);
        }
      }
      
      if (p) { 
        console.log('[CenterPanel] Setting selected product:', p.name);
        setSelected(p);
        // Don't change mode - just update product silently
      } else {
        console.warn('[CenterPanel] Product not found for ID:', e.data.productId);
      }
    }
  };
  return () => ch.close();
}, []);


// In your main app, wherever you trigger the assistant window:
const openAssistantWindow = () => {
 
};

// ── Auto-open FloatingAssistant window on XR start ─────────────────────────────
useEffect(() => {
  if (!isXRMode) return;
  
  // Small delay to ensure main window is ready
  const timer = setTimeout(() => {
    openAssistant();
  }, 500);
  
  return () => clearTimeout(timer);
}, []); // Empty deps - runs once on mount


//  // Then replace your useEffect:
// useEffect(() => {
//   if (!isXRMode || assistantWindowRef.current) return; // ← guard against remounts
//   assistantWindowRef.current = true;

//   initScene('assistant-standalone', (cfg) => ({
//     ...cfg,
//     defaultSize: { width: 600, height: 900 },
//     defaultPosition: { x: -400, y: 0, z: 0 },
//   }));
//   window.open('/assistant', 'assistant-standalone'); // ← match your registered route
// }, []);

  // ── XR window management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isXRMode || mode !== 'catalog') return;
    // initScene(LEFT_WINDOW, (cfg) => ({ ...cfg, defaultSize: { width: LEFT_W, height: LEFT_H }, defaultPosition: { x: -(CENTER_W/2+GAP+LEFT_W/2), y: 0, z: 0 } }));
    // leftWindowRef.current = window.open('/panel-left', LEFT_WINDOW);
  //   initScene(RIGHT_WINDOW, (cfg) => ({ ...cfg, defaultSize: { width: RIGHT_W, height: RIGHT_H }, defaultPosition: { x: CENTER_W/2+GAP+RIGHT_W/2, y: 0, z: 0 } }));
  //    window.open('/panel-right', RIGHT_WINDOW);
  
  // // the extra assistant call + sheri window...
  //   initScene(XR_TOOLBAR_WINDOW, (cfg) => ({ ...cfg, defaultSize: { width: 80, height: 260 }, defaultPosition: { x: CENTER_W/2+GAP+RIGHT_W/2+60, y: -100, z: 0 } }));
  //    window.open('/xr-toolbar', XR_TOOLBAR_WINDOW);
  }, [mode]);

  // ── Broadcast ────────────────────────────────────────────────────────────────
  const broadcastAction = (action: string, data?: any) => {
    const session = getSession();
    if (hasControl && session) session.send({ type: 'control_action', action, data } as any);
  };

  const handleSelectProduct  = (p: Product) => { setSelected(p); setMode('catalog'); broadcastAction('select_product', { productId: p.id }); };
  const handleAddToCart      = () => { addToCart(selected); broadcastAction('add_to_cart', { productId: selected.id }); };
  const handleWishlistProduct= (p: Product) => { addToWishlist(p); broadcastAction('add_to_wishlist', { productId: p.id }); };
  const handleBack           = () => { setMode('catalog'); if (isXRMode) { initScene(LEFT_WINDOW, (cfg) => ({ ...cfg, defaultSize: { width: LEFT_W, height: LEFT_H }, defaultPosition: { x: -(CENTER_W/2+GAP+LEFT_W/2), y: 0, z: 0 } })); leftWindowRef.current = window.open('/panel-left', LEFT_WINDOW); } broadcastAction('back_to_catalog'); };


// In CenterPanelPage.tsx - find handlePlaceIt (around line 200)

const placeProductInXR = async (product: Product) => {

console.log('[CenterPanel] Product imageUrl:', product.imageUrl);
console.log('[CenterPanel] Full product:', product);

  const idx = sceneStore.getObjects().length;
  const obj = makeObject('product', {
    productId: product.id,
    emoji: product.emoji,
    label: product.name,
    color: '#c8b89a',
    participantId: getSession()?.participantId ?? 'local',
    offsetIndex: idx,
    modelUrl: null,
  });
  sceneStore.addObject(obj);

  const winName = `xr-model-${obj.id}`;
  const objData = encodeURIComponent(JSON.stringify({
    id: obj.id, type: obj.type, emoji: obj.emoji,
    label: obj.label, color: obj.color, transform: obj.transform,
  }));

  // Open window
  const win = window.open(`/xr-model?data=${objData}`, winName);
  if (win) {
    initScene(winName, (cfg) => ({
      ...cfg,
      defaultSize: { width: 260, height: 260 },
    minSize:      { width: 260, height: 260 },
    resizable:    true,
     
    }));
  }

  broadcastObject(obj.id, { type: 'sync', payload: obj });
  getSession()?.send({ type: 'control_action', action: 'scene_object_placed', data: { object: obj } } as any);

  // 🔥 FIX: Wait for the window to load before sending messages
  // Give it 1 second to set up its event listeners
  await new Promise(resolve => setTimeout(resolve, 1000));

  const sendReliable = (msg: any, attempts = 15) => {
    let i = 0;
    const send = () => { 
      broadcastObject(obj.id, msg); 
      if (++i < attempts) setTimeout(send, 300); 
    };
    send();
  };

  sendReliable({ type: 'model_loading' });

  try {
    const url = await generateTripo3DModel(
      product.imageUrl ?? '',
      () => {},
      { xrMode: true }
    );
    sendReliable({ type: 'model_ready', payload: { url } }, 30);

  } catch (err) {
    console.error('[XR] Tripo3D failed', err);
    sendReliable({ type: 'model_error' }, 20);
  }
};

const handlePlaceIt = async () => {
  if (isXRMode) {
    await placeProductInXR(selected);
    return;
  }
  // Web mode unchanged
  if (leftWindowRef.current) {
    leftWindowRef.current.close();
    leftWindowRef.current = null;
  }
  setMode('place-it');
  broadcastAction('place_it');
};


  const handleShareToSpace   = () => { const t = { position: { x: Math.random()*2-1, y: 0, z: Math.random()*2-2 }, rotation: { x:0,y:0,z:0 }, scale: { x:1,y:1,z:1 } }; sceneManager.current?.placeObject({ type: 'product', productId: selected.id, transform: t, color: '#c8b89a' }); broadcastAction('share_to_space', { productId: selected.id, transform: t }); };
  const handleSessionReady   = (roomCode: string) => { setCallRoomCode(roomCode); setCallActive(true); setShowCollabLobby(false); sfx.join(); };
  const handleEndCall        = () => { getSession()?.disconnect(); setCallActive(false); setCallRoomCode(''); setHasControl(false); setControlGivenTo(null); setControlledBy(null); sfx.leave(); };

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderControlBanner = () => {
    if (!hasControl && !controlGivenTo && !controlledBy) return null;
    return (
      <div className="control-banner-wrap">
        {hasControl && <div className="control-banner control-banner--active">🎮 You have control · syncing to all<button className="control-revoke-btn" onClick={() => { getSession()?.send({ type: 'control_revoked' } as any); setHasControl(false); sfx.leave(); }}>Release</button></div>}
        {controlGivenTo && !hasControl && <div className="control-banner control-banner--given">👁 <strong>{controlGivenTo}</strong> is controlling your session<button className="control-revoke-btn" onClick={() => { getSession()?.send({ type: 'control_revoked' } as any); setControlGivenTo(null); }}>Revoke</button></div>}
        {controlledBy && !hasControl && !controlGivenTo && (
          <div className="control-banner control-banner--request">
            <strong>{controlledBy}</strong> wants to control your screen
            <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
              <button className="control-accept-btn" onClick={() => { const s = getSession(); if (!s) return; const p = Array.from(s.participants.values()).find(p => p.name === controlledBy); if (p) { s.send({ type: 'control_granted', grantedTo: p.id } as any); setControlGivenTo(controlledBy); } setControlledBy(null); sfx.granted(); }}>Allow</button>
              <button className="control-deny-btn" onClick={() => setControlledBy(null)}>Deny</button>
            </div>
          </div>
        )}
      </div>
    );
  };



  const renderOverlays = () => (
    <>
      {renderControlBanner()}
<FloatingAssistant onOpenCall={openCollab} isCallActive={callActive} />
      {callActive && <FloatingCallOverlay onLeave={handleEndCall} roomCode={callRoomCode} />}
      {showCollabLobby && <div className="collab-lobby-popup"><CollabSessionPage onSessionReady={handleSessionReady} onClose={() => setShowCollabLobby(false)} /></div>}
      {showAssistant && (
        <div className="assistant-drawer">
          <div className="assistant-drawer-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}><span style={{ fontSize: '1.4rem' }}>👩‍💼</span> Sheri</span>
            <button className="assistant-clear-btn" onClick={() => setShowAssistant(false)}>✕</button>
          </div>
          <iframe src="/assistant" className="assistant-drawer-frame" title="AI Assistant" />
        </div>
      )}
      {showWishlist && (
        <div className="wishlist-drawer">
          <WishlistPanel items={wishlistItems} onRemove={(id) => setWishlistItems(prev => prev.filter(p => p.id !== id))} onClose={() => setShowWishlist(false)} />
        </div>
      )}
      {showLayouts && (
        <div className="layout-manager-popup">
          <LayoutManager onClose={() => setShowLayouts(false)} wishlistCount={wishlistItems.length} cartCount={cartCount} />
        </div>
      )}
      {showCart && (
        <div className="cart-drawer-wrap">
          <CartPanel items={cartItems} onUpdateQty={updateQty} onRemove={removeFromCart} onClose={() => setShowCart(false)} />
        </div>
      )}
    </>
  );

  // ── XR render ─────────────────────────────────────────────────────────────────
  if (isXRMode) {
    return (
      <div className="xr-single-panel-root">
        {/* <AISceneTips
          objects={sceneStore.getObjects()}
          selectedId={null}
          cartItems={cartItems}
          wishlistItems={wishlistItems}
          budget={budget}
          currentProduct={selected}
          onAddToCart={addToCart}
          onOpenCart={() => setShowCart(true)}
          onOpenWishlist={() => setShowWishlist(true)}
        /> */}
        {mode === 'place-it' && <PlaceItView product={selected} hasControl={hasControl} onBack={handleBack} onShareToSpace={handleShareToSpace} />}
{mode === 'browse' && (
  <BrowsePage 
    onSelectProduct={handleSelectProduct} 
    onWishlist={handleWishlistProduct} 
    cartCount={cartCount}
    wishlistCount={wishlistItems.length}
    hasControl={hasControl} 
    isCallActive={callActive}
    broadcastAction={broadcastAction}
    onOpenCart={openCartWindow}
    onOpenWishlist={openWishlistWindow}
    onOpenAssistant={openAssistant}
    onOpenCollab={openCollab}
    onOpenLighting={openLighting}
    // onOpenLayouts={openLayoutsWindow}
  />
)}
  {mode === 'catalog' && (
  <CenterPanel
    product={selected}
    cartCount={cartCount}
    wishlistCount={wishlistItems.length}
    onAddToCart={handleAddToCart}
    onPlaceIt={handlePlaceIt}
    onWishlist={() => handleWishlistProduct(selected)}
    onAssistant={openAssistant}
    onLighting={openLighting}
    onCollab={openCollab}
    onOpenCart={openCartWindow}
    onOpenWishlist={openWishlistWindow}
    onOpenLayouts={() => setShowLayouts(true)}
    onBack={() => setMode('browse')}
    isCallActive={callActive}
  />
)}
{/* <FloatingAssistant onOpenCall={openCollab} isCallActive={callActive} /> */}
      </div>
    );
  }

  // ── Desktop renders ───────────────────────────────────────────────────────────
  if (mode === 'place-it') return <><div className="place-it-root"><PlaceItView product={selected} hasControl={hasControl} onBack={handleBack} onShareToSpace={handleShareToSpace} /></div>{renderOverlays()}</>;

if (mode === 'browse') return (
  <>
    <BrowsePage 
      onSelectProduct={handleSelectProduct} 
      onWishlist={handleWishlistProduct} 
      cartCount={cartCount}
      wishlistCount={wishlistItems.length}
      hasControl={hasControl} 
      isCallActive={callActive}
      broadcastAction={broadcastAction}
      onOpenCart={openCartWindow}
      onOpenWishlist={openWishlistWindow}
      onOpenAssistant={() => setShowAssistant(true)}
      onOpenCollab={openCollab}
      onOpenLighting={openLighting}
     //onOpenLayouts={openLayoutsWindow}
    />
    {renderOverlays()}
  </>
);

  return (
    <>
      <div className="app-root">
        <div style={{ position: 'fixed', top: '1rem', left: '1rem', zIndex: 100 }}>
          <button className="browse-back-btn" onClick={() => { setMode('browse'); broadcastAction('browse'); }}>← All products</button>
        </div>
        {/* <LeftPanel selectedId={selected.id} onSelect={handleSelectProduct} /> */}
      <CenterPanel
    product={selected}
    cartCount={cartCount}
    wishlistCount={wishlistItems.length}
    onAddToCart={handleAddToCart}
    onPlaceIt={handlePlaceIt}
    onWishlist={() => handleWishlistProduct(selected)}
    onAssistant={openAssistant}
    onLighting={openLighting}
    onCollab={openCollab}
    onOpenCart={openCartWindow}
    onOpenWishlist={openWishlistWindow}
    onOpenLayouts={() => setShowLayouts(true)}
    onBack={() => setMode('browse')}
    isCallActive={callActive}
  />
      </div>
      {renderOverlays()}
    </>
  );
}