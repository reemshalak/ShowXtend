/**
 * CartPanel — Slide-in cart drawer for web.
 * Matches the reference: items with emoji thumb, qty +/-, price, total, checkout.
 */

import { useState } from 'react';
import type { Product } from './data';

//@ts-ignore
import  './css/CartPage.css';
interface CartItem {
  product: Product;
  qty: number;
}

interface CartPanelProps {
  items: CartItem[];
  onUpdateQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
  onClose: () => void;
}

export default function CartPanel({ items, onUpdateQty, onRemove, onClose }: CartPanelProps) {
  const total = items.reduce((s, i) => s + Number(i.product.priceNum) * i.qty, 0);

  return (
    <div className="cart-drawer">
      {/* Header */}
      <div className="cart-drawer-header">
        <span className="cart-drawer-title">Cart</span>
        <button className="assistant-clear-btn" onClick={onClose}>✕</button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="cart-empty">
          <span style={{ fontSize: '2.5rem' }}>🛒</span>
          <p>Your cart is empty</p>
        </div>
      )}

      {/* Items */}
      <div className="cart-items">
        {items.map(({ product, qty }) => (
          <div key={product.id} className="cart-item">
             <div className="wishlist-item-thumb">
                {(product as any).imageUrl
                  ? <img
                      src={(product as any).imageUrl}
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                    />
                  : product.emoji}
              </div>
            <div className="cart-item-body">
              <div className="cart-item-name">{product.name}</div>
              <div className="cart-item-type">{product.fullType}</div>
              <div className="cart-item-controls">
                <div className="cart-qty-row">
                  <button
                    className="cart-qty-btn"
                    onClick={() => qty === 1 ? onRemove(product.id) : onUpdateQty(product.id, qty - 1)}
                  >−</button>
                  <span className="cart-qty-num">{qty}</span>
                  <button
                    className="cart-qty-btn"
                    onClick={() => onUpdateQty(product.id, qty + 1)}
                  >+</button>
                </div>
                <span className="cart-item-price">
                  ${(Number(product.priceNum) * qty).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="cart-footer">
          <div className="cart-total-row">
            <span className="cart-total-label">Total</span>
            <span className="cart-total-amount">${total.toFixed(2)}</span>
          </div>
          <button className="cart-checkout-btn">
            Checkout →
          </button>
          <p className="cart-delivery-note">Delivery fees not included</p>
        </div>
      )}
    </div>
  );
}
