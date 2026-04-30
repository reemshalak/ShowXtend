// WishlistPage.tsx
//@ts-ignore
import WishlistPanel from './WishlistPanel';
import { useState, useEffect } from 'react';
import type { Product } from './data';

const WISHLIST_CHANNEL = 'wishlist-channel';

export default function WishlistPage() {
  const [items, setItems] = useState<Product[]>([]);

  // Listen for wishlist updates from main app
  useEffect(() => {
    const ch = new BroadcastChannel(WISHLIST_CHANNEL);
    
    ch.onmessage = (e) => {
      console.log('[WishlistPage] Received:', e.data);
      if (e.data?.type === 'state' && e.data.items) {
        setItems(e.data.items);
      }
    };
    
    // Request initial state
    ch.postMessage({ type: 'get_state' });
    
    return () => ch.close();
  }, []);

  const handleRemove = (id: number) => {
    // Broadcast remove to main app
    const ch = new BroadcastChannel(WISHLIST_CHANNEL);
    ch.postMessage({ type: 'remove', productId: id });
    ch.close();
    
    // Also update local state optimistically
    setItems(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="wishlist-page-root">
      <WishlistPanel
        items={items}
        onRemove={handleRemove}
        onClose={() => window.history.back()}
      />
    </div>
  );
}