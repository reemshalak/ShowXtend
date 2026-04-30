import { createRoot } from 'react-dom/client';
//@ts-ignore
import './index.css';
import { isXRMode } from './xrMode';

if (isXRMode) {
  document.documentElement.classList.add('is-spatial');
}

const path = window.location.pathname;

const routes: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  '/panel-left':        () => import('./LeftPanelPage'),
  '/panel-right':       () => import('./RightPanelPage'),
  '/place-also-like':   () => import('./PlaceAlsoLikePage'),
  '/place-toolbar':     () => import('./PlaceToolbarPage'),
  '/place-checkout':    () => import('./PlaceCheckoutPage'),

  '/wishlist':          () => import('./WishlistPage'),          // ← NEW: XR wishlist panel
  '/cart':              () => import('./CartPage'),          // ← NEW: XR cart window
  '/assistant':         () => import('./components/FloatingAssistantStandalone'),
  '/lighting':          () => import('./LightingPage'),
  '/collab':            () => import('./CollabSessionPage'),
  '/xr-toolbar':        () => import('./XRToolbarPage'),
  '/xr-scene':          () => import('./Shared3DScene'),
  '/xr-model':          () => import('./XRModelWindow'),
  '/xr-object-toolbar': () => import('./XRObjectToolbarWindow'),
  '/compare':           () => import('./ComparePage'),  // ← NEW
  '/ai-suggestions':     () => import('./FashionBrowserView'),

};

const loader = routes[path] ?? (() => import('./CenterPanelPage'));
const { default: Component } = await loader();

createRoot(document.getElementById('root')!).render(<Component />);