/**
 * PlaceAlsoLikePage — Standalone XR scene for "You may also like".
 * Opened by PlaceItView at '/place-also-like'.
 * Reads the current product from BroadcastChannel to show related items.
 */

import { useEffect, useState } from 'react';
import { PRODUCTS, type Product } from './data';

const CHANNEL_NAME = 'catalog-product-select';

function getRelated(current: Product) {
  return PRODUCTS.filter((p) => p.id !== current.id).slice(0, 4);
}

export default function PlaceAlsoLikePage() {
  const [product, setProduct] = useState<Product>(PRODUCTS[2]);
  const related = getRelated(product);

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
      <div enable-xr className="spatial-panel place-left-panel">
        <p className="also-like-title">You may also like</p>
        <div className="also-like-grid">
          {related.map((p) => (
            <div key={p.id} className="also-like-card">
              <div className="also-like-thumb">{p.emoji}</div>
              <p className="also-like-name">{p.name.toUpperCase()}</p>
              <p className="also-like-type">{p.type}</p>
              <p className="also-like-price">{p.price}</p>
            </div>
          ))}
        </div>
        <button className="view-more-btn">View more</button>
      </div>
    </div>
  );
}
