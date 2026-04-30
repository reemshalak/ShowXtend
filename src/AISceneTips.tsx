/**
 * AISceneTips — Proactive Gemini-powered tips for placed objects.
 *
 * Linked to assistantActions: when a tip suggests an action
 * (e.g. "Try warm lighting with this sofa") it renders a one-tap
 * action button that executes the action directly without going
 * through the chat UI.
 *
 * Tips include:
 *   - Design/style notes
 *   - Lighting suggestions (with action button → set_lighting)
 *   - Budget warnings (with action button → check_budget)
 *   - "Complete the look" suggestions (with action button → complete_the_look)
 *   - Removal suggestion if product looks out of place
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { type PlacedObject } from './sceneStore';
import { PRODUCTS } from './data';
import { spatialSounds } from './spatialSounds';
import { executeToolCall, type AppContext, type CartItem } from './assistantActions';
import { searchProducts } from './ikeaApi';

const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

// ── Tip shape ──────────────────────────────────────────────────────────────
interface Tip {
  id:        string;
  objectId:  string;
  category:  'Ergonomics' | 'Style Match' | 'Space' | 'Budget' | 'Lighting' | 'Design' | 'Complete';
  text:      string;
  emoji:     string;
  // Optional action the tip can trigger with one tap
  action?: {
    label:     string;
    toolName:  string;
    toolArgs:  Record<string, any>;
  };
}

interface AISceneTipsProps {
  objects:      PlacedObject[];
  selectedId:   string | null;
  tipPosition?: { x: number; y: number };
  // These come from CenterPanelPage so tips can execute real actions
  cartItems?:    CartItem[];
  wishlistItems?: any[];
  budget?:       number;
  onAddToCart?:   (p: any) => void;
  onOpenCart?:    () => void;
  onOpenWishlist?: () => void;
  currentProduct?: any;
}

// ── Fetch tip from Gemini ─────────────────────────────────────────────────────
async function fetchTip(
  objects: PlacedObject[],
  focusId: string,
  cartItems: CartItem[],
  budget: number,
): Promise<Tip | null> {
  if (!GEMINI_KEY) return null;

  const focus   = objects.find(o => o.id === focusId);
  if (!focus) return null;

  const product      = PRODUCTS.find(p => p.id === focus.productId);
  const sceneNames   = objects.map(o => PRODUCTS.find(p => p.id === o.productId)?.name ?? o.type).join(', ');
const cartTotal = cartItems.reduce((s, i) => {
  const price = typeof i.product.priceNum === 'number' ? i.product.priceNum : parseFloat(String(i.product.priceNum ?? 0));
  return s + (price) * i.qty;
}, 0);
  const budgetNote   = budget > 0
    ? `User budget: $${budget}. Cart total so far: $${cartTotal}. ${cartTotal > budget ? 'OVER BUDGET.' : `$${budget - cartTotal} remaining.`}`
    : '';

  const prompt = `You are an AI spatial design assistant watching a user arrange furniture in AR.
Scene: ${objects.length} object(s) — ${sceneNames}.
Selected: ${product?.name ?? focus.type} ($${product?.priceNum ?? '?'}).
${budgetNote}

Generate ONE short proactive tip (max 12 words) about the selected object in context.
Choose the most relevant category: Ergonomics | Style Match | Space | Budget | Lighting | Design | Complete

Optionally suggest a one-tap action:
- "set_lighting" with args {"preset": "warm"|"cool"|"daylight"|"evening"|"showroom"}
- "complete_the_look" with args {}
- "check_budget" with args {}
- "remove_placed_product" with args {"all": false}
- null if no action fits

Respond ONLY as JSON (no markdown):
{
  "category": "...",
  "text": "...",
  "emoji": "...",
  "action": { "label": "Try it", "toolName": "set_lighting", "toolArgs": {"preset": "warm"} } | null
}`;

  try {
    const res = await fetch(GEMINI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.6 },
      }),
    });
    if (!res.ok) return null;
    const data    = await res.json();
    const raw     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return {
      id:       `${Date.now()}`,
      objectId: focusId,
      category: parsed.category ?? 'Design',
      text:     parsed.text ?? '',
      emoji:    parsed.emoji ?? '✨',
      action:   parsed.action ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AISceneTips({
  objects, selectedId, tipPosition,
  cartItems = [], wishlistItems = [], budget = 0,
  onAddToCart, onOpenCart, onOpenWishlist, currentProduct,
}: AISceneTipsProps) {
  const [tip,      setTip]      = useState<Tip | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [visible,  setVisible]  = useState(false);
  const [acting,   setActing]   = useState(false);
  const lastId     = useRef<string | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedId) { setVisible(false); return; }
    if (lastId.current === selectedId && tip?.objectId === selectedId) { setVisible(true); return; }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      lastId.current = selectedId;
      setLoading(true);
      setVisible(false);
      const result = await fetchTip(objects, selectedId, cartItems, budget);
      if (result) { setTip(result); setVisible(true); spatialSounds?.tip?.(); }
      setLoading(false);
    }, 800);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Build a minimal AppContext for action execution from tip buttons
  const buildCtx = useCallback((): AppContext => ({
    currentProduct: currentProduct ?? PRODUCTS[0],
    catalog:        PRODUCTS,
    cartItems,
    wishlistItems,
    budget,
    setCatalog:      () => {},
    setCurrentProduct: () => {},
    addToCart:       (p) => onAddToCart?.(p),
    removeFromCart:  () => {},
    addToWishlist:   () => {},
    openCart:        () => onOpenCart?.(),
    openWishlist:    () => onOpenWishlist?.(),
    openCollab:      () => {},
    speak:           () => {},
  }), [currentProduct, cartItems, wishlistItems, budget, onAddToCart, onOpenCart, onOpenWishlist]);

  const handleAction = async () => {
    if (!tip?.action) return;
    setActing(true);
    try {
      await executeToolCall({ name: tip.action.toolName, args: tip.action.toolArgs }, buildCtx());
      setVisible(false);
      setTip(null);
      lastId.current = null;
    } finally {
      setActing(false);
    }
  };

  if (!selectedId || (!visible && !loading)) return null;

  const left = tipPosition?.x ?? 120;
  const top  = tipPosition ? Math.max(20, tipPosition.y - 145) : 60;

  // Category → accent color
  const categoryColor: Record<string, string> = {
    Ergonomics:  '#34d399',
    'Style Match':'#a78bfa',
    Space:       '#38bdf8',
    Budget:      '#fb923c',
    Lighting:    '#fbbf24',
    Design:      '#c4b5fd',
    Complete:    '#f472b6',
  };
  const accent = categoryColor[tip?.category ?? 'Design'] ?? '#c4b5fd';

  return (
    <div style={{
      position: 'absolute', left, top,
      transform: 'translateX(-50%)',
      zIndex: 80,
      pointerEvents: loading ? 'none' : 'auto',
      animation: visible ? 'tip-rise 0.3s cubic-bezier(0.16,1,0.3,1)' : undefined,
      minWidth: 210, maxWidth: 250,
    }}>
      {/* Connector */}
      <div style={{ position:'absolute', bottom:-18, left:'50%', width:1, height:18,
        background:'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)',
        transform:'translateX(-50%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:-22, left:'50%', width:6, height:6,
        borderRadius:'50%', background:'rgba(255,255,255,0.3)',
        transform:'translateX(-50%)', pointerEvents:'none' }} />

      {/* Card */}
      <div style={{
        background:     'rgba(8,8,18,0.92)',
        backdropFilter: 'blur(28px)',
        border:         `1px solid ${accent}44`,
        borderRadius:   16,
        padding:        '0.85rem 0.95rem',
        boxShadow:      `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${accent}22`,
      }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.12)',
              borderTopColor: accent, borderRadius:'50%',
              animation:'spin 0.8s linear infinite' }} />
            <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.3)' }}>Analyzing scene…</span>
          </div>
        ) : tip ? (
          <>
            {/* Category + dismiss */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.45rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem',
                background:`${accent}18`, border:`1px solid ${accent}44`,
                borderRadius:100, padding:'0.12rem 0.5rem' }}>
                <span style={{ fontSize:'0.7rem' }}>{tip.emoji}</span>
                <span style={{ fontSize:'0.62rem', color: accent, fontWeight:700,
                  letterSpacing:'0.05em', textTransform:'uppercase' }}>{tip.category}</span>
              </div>
              <button onClick={() => { setVisible(false); setTip(null); lastId.current = null; }}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.25)',
                  cursor:'pointer', fontSize:'0.72rem', padding:'0 0 0 4px' }}>✕</button>
            </div>

            {/* Tip text */}
            <p style={{ margin:0, fontSize:'0.8rem', color:'rgba(255,255,255,0.85)',
              lineHeight:1.45, fontWeight:500 }}>
              {tip.text}
            </p>

            {/* Action button */}
            {tip.action && (
              <button onClick={handleAction} disabled={acting}
                style={{
                  marginTop:      '0.6rem',
                  width:          '100%',
                  padding:        '0.35rem 0',
                  borderRadius:   10,
                  border:         `1px solid ${accent}55`,
                  background:     `${accent}1a`,
                  color:          accent,
                  fontSize:       '0.7rem',
                  fontWeight:     600,
                  cursor:         acting ? 'wait' : 'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '0.3rem',
                  opacity:        acting ? 0.6 : 1,
                  transition:     'opacity 0.15s',
                }}>
                {acting ? '…' : `⚡ ${tip.action.label}`}
              </button>
            )}

            {/* Footer */}
            <div style={{ marginTop:'0.5rem', paddingTop:'0.4rem',
              borderTop:'1px solid rgba(255,255,255,0.06)',
              fontSize:'0.6rem', color:'rgba(255,255,255,0.22)',
              display:'flex', alignItems:'center', gap:'0.25rem' }}>
              <span>✨</span> Sheri · AI spatial tip
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}