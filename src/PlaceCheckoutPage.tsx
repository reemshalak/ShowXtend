/**
 * PlaceCheckoutPage — Standalone XR scene for the bottom checkout card.
 * Opened by PlaceItView at '/place-checkout'.
 * Listens for product changes via BroadcastChannel.
 */

import { useEffect, useState } from 'react';
import { PRODUCTS, type Product } from './data';

const CHANNEL_NAME = 'catalog-product-select';

export default function PlaceCheckoutPage() {
  const [product, setProduct] = useState<Product>(PRODUCTS[2]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e) => {
      if (e.data?.type === 'select' && e.data.productId != null) {
        const p = PRODUCTS.find((p) => p.id === e.data.productId);
        if (p) setProduct(p);
      }
    };
    return () => channel.close();
  }, []);

  return (
    <div className="xr-single-panel-root">
      <div enable-xr className="spatial-panel place-bottom-panel">
        <div className="checkout-product-row">
          <div className="checkout-thumb">{product.emoji}</div>
          <div className="checkout-info">
            <span className="checkout-name">{product.name.toUpperCase()}</span>
            <span className="checkout-sub">{product.fullType}</span>
          </div>
          <span className="checkout-price">${product.priceNum}</span>
        </div>
        <div className="checkout-divider" />
        <div className="checkout-footer-row">
          <span className="checkout-delivery">Delivery fees not included</span>
          <button className="checkout-btn">Continue to checkout</button>
        </div>
      </div>
    </div>
  );
}
