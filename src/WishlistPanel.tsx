/**
 * WishlistPanel — glassy frosted panel matching cart reference.
 * Used as web drawer (modal) and standalone XR window (/wishlist).
 */
import { useState } from 'react';
import type { Product } from './data';

//@ts-ignore
import './css/WishlistPage.css';

interface Props {
  items:    Product[];
  onRemove: (id: number) => void;
  onClose:  () => void;
}

/** Safe localStorage wrapper — never throws (crashes XR runtime) */
function safeGetStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* XR context — ignore */ }
}

export default function WishlistPanel({ items, onRemove, onClose }: Props) {
  const [budget,      setBudget]      = useState<number>(() => {
    const v = Number(safeGetStorage('shopping_budget') ?? '0');
    return isNaN(v) ? 0 : v;
  });
  const [editBudget,  setEditBudget]  = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const total = items.reduce((s, p) => s + Number(p.priceNum ?? 0), 0);
  const pct   = budget > 0 ? Math.min(100, (total / budget) * 100) : 0;
  const over  = budget > 0 && total > budget;

  const saveBudget = () => {
    const v = Number(budgetInput);
    if (v > 0) {
      setBudget(v);
      safeSetStorage('shopping_budget', String(v));
    }
    setEditBudget(false);
  };

  return (
     <div>
    <div className="wishlist-panel">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="wishlist-header">
        <div>
          <h2 className="wishlist-title">Wishlist</h2>
          {items.length > 0 && (
            <span className="wishlist-count">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button className="wishlist-close-btn" onClick={onClose} aria-label="Close wishlist">✕</button>
      </div>

      {/* ── Budget bar (only when relevant) ─────────────────────────────── */}
      {(budget > 0 || items.length > 0) && (
        <div className="budget-section">
          <div className="budget-row">
            <span className="budget-label">💰 Budget</span>
            {!editBudget ? (
              <button
                className="budget-set-btn"
                onClick={() => { setBudgetInput(String(budget || '')); setEditBudget(true); }}
              >
                {budget > 0 ? `$${budget}` : 'Set budget'}
              </button>
            ) : (
              <div className="budget-edit-row">
                <input
                  className="budget-input"
                  type="number"
                  placeholder="Budget $"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  autoFocus
                />
                <button className="budget-save-btn" onClick={saveBudget}>✓</button>
              </div>
            )}
          </div>

          {budget > 0 && (
            <>
              <div className="budget-bar-track">
                <div
                  className={`budget-bar-fill${over ? ' budget-bar-fill--over' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="budget-status-row">
                <span className={`budget-total${over ? ' budget-total--over' : ''}`}>
                  ${total.toFixed(0)} {over ? '⚠ over budget' : `/ $${budget}`}
                </span>
                {!over && (
                  <span className="budget-remaining">${(budget - total).toFixed(0)} left</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Items ───────────────────────────────────────────────────────── */}
      <div className="wishlist-body">
        {items.length === 0 ? (
          <div className="wishlist-empty">
            <span style={{ fontSize: '2rem' }}>♡</span>
            <p style={{ margin: 0 }}>Your wishlist is empty</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)' }}>
              Tap ♡ on any product to save it
            </p>
          </div>
        ) : (
          items.map(p => (
            <div key={p.id} className="wishlist-item">
              <div className="wishlist-item-thumb">
                {(p as any).imageUrl
                  ? <img
                      src={(p as any).imageUrl}
                      alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }}
                    />
                  : p.emoji}
              </div>
              <div className="wishlist-item-info">
                <div className="wishlist-item-name">{p.name}</div>
                <div className="wishlist-item-sub">{p.type}</div>
              </div>
              <span className="wishlist-item-price">{p.price}</span>
              <button
                className="wishlist-remove-btn"
                onClick={() => onRemove(p.id)}
                aria-label={`Remove ${p.name}`}
              >✕</button>
            </div>
          ))
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="wishlist-footer">
          <div className="wishlist-total-row">
            <div className="wishlist-total-label">Total</div>
            <div className="wishlist-total-price">${total.toFixed(2)}</div>
          </div>
          <button className="wishlist-share-btn">Share list ↗</button>
        </div>
      )}
    </div>
    </div>
  );
}