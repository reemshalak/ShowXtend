/**
 * LeftPanelPage — Standalone XR scene for the left product-list panel.
 */

import { useEffect, useState } from 'react';
import { PRODUCTS, type Product } from './data';
import { getSession, joinSession } from './collaboration';

const PRODUCT_CHANNEL = 'catalog-product-select';
const SESSION_CHANNEL = 'session-join-channel';

export default function LeftPanelPage() {
  const [selectedId, setSelectedId] = useState(PRODUCTS[2].id);
  const [hasControl, setHasControl] = useState(false);

  // ── FIX 1: Mirror-join when /collab popup broadcasts session info ──────────
  useEffect(() => {
    const ch = new BroadcastChannel(SESSION_CHANNEL);
    const mirrorJoin = async (roomCode: string, name: string) => {
      const existing = getSession();
      if (existing && existing.roomCode === roomCode) return;
      try {
        await joinSession(roomCode, `${name} (Left)`);
      } catch (err) { console.warn('LeftPanel mirror join failed:', err); }
    };
    ch.onmessage = (e) => {
      if (e.data?.type === 'session_joined') mirrorJoin(e.data.roomCode, e.data.name);
    };
    ch.postMessage({ type: 'REQUEST_SESSION_RE_BROADCAST' });
    return () => ch.close();
  }, []);

  // ── FIX 2: Listen for LOCAL changes (BroadcastChannel) ──────────────────────
  // This ensures that when the CenterPanel switches products (remote or local),
  // this LeftPanel window updates its "active" blue state.
  useEffect(() => {
    const localCh = new BroadcastChannel(PRODUCT_CHANNEL);
    localCh.onmessage = (e) => {
      if (e.data?.type === 'select' && e.data.productId) {
        setSelectedId(e.data.productId);
      }
    };
    return () => localCh.close();
  }, []);

  // ── FIX 3: Remote Sync Listener ─────────────────────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const checkSession = setInterval(() => {
      const session = getSession();
      if (session) {
        unsubscribe = session.onEvent((event) => {
          if (event.type === 'control_granted' && event.grantedTo === session.participantId) {
            setHasControl(true);
          }
          if (event.type === 'control_revoked') {
            setHasControl(false);
          }
          // Sync selection from remote users
          if ((event as any).type === 'control_action') {
            const { action, data } = event as any;
            if (action === 'select_product' && data?.productId) {
              setSelectedId(data.productId);
            }
          }
        });
        clearInterval(checkSession);
      }
    }, 500);
    return () => {
      clearInterval(checkSession);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleSelect = (p: Product) => {
    setSelectedId(p.id);
    
    // 1. Tell the Center Panel on THIS device to update
    const channel = new BroadcastChannel(PRODUCT_CHANNEL);
    channel.postMessage({ type: 'select', productId: p.id });
    channel.close();
    
    // 2. Tell OTHER devices (Web/PICO) to update
    const session = getSession();
    if (hasControl && session) {
      session.send({ 
        type: 'control_action', 
        action: 'select_product', 
        data: { productId: p.id } 
      } as any);
    }
  };

  return (
    <div className="xr-single-panel-root">
      <div className="spatial-panel left-panel">
        <div className="left-panel-header">
          <button className="back-btn">← All Collections</button>
          {hasControl && <span className="control-indicator-dot" title="You are controlling" />}
        </div>

        <div className="product-list-scroll">
          {PRODUCTS.map((p) => (
            <button
              key={p.id}
              className={`product-list-item ${p.id === selectedId ? 'active' : ''}`}
              onClick={() => handleSelect(p)}
            >
              <div className="product-list-thumb">
                <span style={{ fontSize: '1.4rem' }}>{p.emoji}</span>
              </div>
              <div className="product-list-info">
                <div className="product-list-name">{p.name}</div>
                <div className="product-list-sub">{p.type}</div>
              </div>
              <span className="product-list-price">{p.price}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}