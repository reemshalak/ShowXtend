/**
 * CartPage — standalone XR window for the cart.
 * Route: /cart
 *
 * Opened as its own spatial window by CenterPanelPage when in XR mode.
 * Communicates with CenterPanelPage via CART_CHANNEL BroadcastChannel.
 * Reads live state pushed from CenterPanelPage every 2s.
 */
//@ts-ignore
import  './css/CartPage.css';

import { useEffect, useState } from 'react';
import CartPanel from './CartPanel';
import type { Product } from './data';


const CART_CHANNEL = 'cart-channel';
interface CartItem { product: Product; qty: number; }

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const ch = new BroadcastChannel(CART_CHANNEL);
    ch.onmessage = (e) => {
      if (e.data?.type === 'state' && Array.isArray(e.data.items)) {
        setItems(e.data.items);
      }
    };
    return () => ch.close();
  }, []);

  function send(msg: any) {
    try { const ch = new BroadcastChannel(CART_CHANNEL); ch.postMessage(msg); ch.close(); } catch {}
  }

  return (
    // Transparent root — no border, no background
<div className="cart-page-root">
     <CartPanel
        items={items}
        onUpdateQty={(id, qty) => send({ type: 'update_qty', productId: id, qty })}
        onRemove={(id)         => send({ type: 'remove', productId: id })}
        onClose={() => { try { window.close(); } catch {} }}
      />
    </div>
  );
}
