/**
 * ComparePage — standalone XR window for product comparison.
 * Route: /compare
 *
 * Receives initialLeft / initialRight via URL search params (JSON encoded).
 * Also listens on BroadcastChannel('compare-channel') for pushed products
 * from CenterPanelPage when the user clicks "Compare" on a card.
 */

import { useEffect, useState } from 'react';
import CompareView from './CompareView';
import { getAllProducts } from './ikeaApi';
import type { Product } from './data';

const COMPARE_CHANNEL = 'compare-channel';

export default function ComparePage() {
  const params = new URLSearchParams(window.location.search);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [initialLeft,  setInitialLeft]  = useState<Product | undefined>(() => {
    try { const d = params.get('left');  return d ? JSON.parse(decodeURIComponent(d)) : undefined; } catch { return undefined; }
  });
  const [initialRight, setInitialRight] = useState<Product | undefined>(() => {
    try { const d = params.get('right'); return d ? JSON.parse(decodeURIComponent(d)) : undefined; } catch { return undefined; }
  });

  // Load real IKEA products
  useEffect(() => {
    getAllProducts().then(products => {
      setCatalog(products);
      setLoading(false);
    }).catch(err => {
      console.error('[ComparePage] Failed to load products:', err);
      setLoading(false);
    });
  }, []);

  // Listen for products pushed from outside (e.g. clicking "Compare" in BrowsePage)
  useEffect(() => {
    const ch = new BroadcastChannel(COMPARE_CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'set_left'  && e.data.product) setInitialLeft(e.data.product);
      if (e.data?.type === 'set_right' && e.data.product) setInitialRight(e.data.product);
    };
    return () => ch.close();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        width: '100%', height: '100vh', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: 'white'
      }}>
        <div>Loading products...</div>
      </div>
    );
  }

  return (
    <CompareView
      catalog={catalog}
      initialLeft={initialLeft}
      initialRight={initialRight}
      onClose={() => { try { window.close(); } catch {} }}
    />
  );
}