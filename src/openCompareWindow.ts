/**
 * openCompareWindow — call this from BrowsePage or CenterPanel
 * to open the comparison panel (new XR window or web modal).
 *
 * Usage:
 *   import { openCompareWindow } from './openCompareWindow';
 *   <button onClick={() => openCompareWindow(product)}>Compare</button>
 */

import { initScene } from '@webspatial/react-sdk';
import { isXRMode } from './xrMode';
import type { Product } from './data';

const WIN_NAME = 'compare-window';
const COMPARE_CHANNEL = 'compare-channel';

let winRef: Window | null = null;

export function openCompareWindow(product?: Product, side: 'left' | 'right' = 'left') {
  console.log('🔵 openCompareWindow called', { product, side, isXRMode });
  
  if (isXRMode) {
    console.log('🎮 XR Mode - opening spatial window');
    if (winRef && !winRef.closed) {
      console.log('Window already open, broadcasting product');
      const ch = new BroadcastChannel(COMPARE_CHANNEL);
      ch.postMessage({ type: side === 'left' ? 'set_left' : 'set_right', product });
      ch.close();
      return;
    }
    const leftParam = product && side === 'left'
      ? `?left=${encodeURIComponent(JSON.stringify(product))}`
      : '';
    console.log('Opening new window with param:', leftParam);
    initScene(WIN_NAME, (cfg) => ({
      ...cfg,
      defaultSize: { width: 900, height: 720 },
      defaultPosition: { x: 0, y: 0, z: 0 },
    }));
    winRef = window.open(`/compare${leftParam}`, WIN_NAME);
  } else {
    console.log('💻 Web Mode - opening popup');
    // Fallback: open as popup window
    const leftParam = product && side === 'left'
      ? `?left=${encodeURIComponent(JSON.stringify(product))}`
      : '';
    window.open(`/compare${leftParam}`, 'compare', 'width=900,height=720,popup');
  }
}

/** Push a product into the already-open compare window */
export function pushToCompare(product: Product, side: 'left' | 'right' = 'left') {
  try {
    const ch = new BroadcastChannel(COMPARE_CHANNEL);
    ch.postMessage({ type: side === 'left' ? 'set_left' : 'set_right', product });
    ch.close();
  } catch {}
}
