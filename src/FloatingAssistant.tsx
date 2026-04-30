/**
 * FloatingAssistant.tsx
 *
 * Self-contained floating AI assistant with:
 *
 * FUNCTIONALITY (ported from AIAssistantPage.tsx):
 *  • Gemini 2.0 Flash function-calling (search, cart, place, lighting, budget…)
 *  • Local router for instant common commands (no API round-trip)
 *  • SpeechRecognition voice input with silence-detection auto-send
 *  • SpeechSynthesis TTS output (toggleable)
 *  • BroadcastChannel sync with cart, product selection, wishlist, browse
 *  • Chat history persisted in localStorage (last 30 messages)
 *  • Quick-prompt chips
 *  • Tool-call action badges in messages
 *  • Budget tracking pill
 *
 * UI (new glassy spatial design):
 *  • Pulsing glassy orb — green idle, blue listening, purple processing
 *  • Web Audio API sounds: tick on press, hum during processing, chime on reply
 *  • Audio-reactive mic visualizer bars inside the orb
 *  • iMessage-style bubbles: user = right blue, AI = left glassy grey
 *  • Glassmorphism chat panel with animated entrance
 *  • Status header pill with live state label
 *  • enable-xr on orb so it works in PICO WebSpatial
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCTS, type Product } from './data';
import { getSession } from './collaboration';
import { searchProducts, browseCategory, hasApiKey, aiSearchProducts } from './ikeaApi';
import { localRouter, TOOL_DEFINITIONS, type ToolCall } from './assistantActions';
import { isXRMode } from './xrMode';

//@ts-ignore
import './css/FloatingAssistant.css';
import FashionBrowserView from './FashionBrowserView';
import { initScene } from '@webspatial/react-sdk';

// ─── Channel names (must match rest of app) ───────────────────────────────
const PRODUCT_CHANNEL  = 'catalog-product-select';
const CART_CHANNEL     = 'cart-channel';
const ACTION_CHANNEL   = 'assistant-action';
const LIGHTING_CHANNEL = 'lighting-channel';
const BROWSE_CHANNEL   = 'browse-search-channel';
const BUDGET_KEY       = 'shopping_budget';
const HISTORY_KEY      = 'assistant-chat-history';


// ─── API keys ─────────────────────────────────────────────────────────────
const GEMINI_KEY      = (import.meta as any).env?.VITE_GEMINI_API_KEY ?? '';
const OPENROUTER_KEY  = (import.meta as any).env?.VITE_OPENROUTER_API_KEY ?? '';
const OPENROUTER_URL  = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';


// Unique identity for this window — used to filter out self-echoed BroadcastChannel messages.
// BroadcastChannel does NOT deliver messages to the sender's own tab,
// but in some PICO WebView builds / standalone window setups it can.
const WIN_ID = Math.random().toString(36).slice(2);

// ─── Store last suggested product for "add to cart" confirmation (module-level) ───
let lastSuggestedProductGlobal: { name: string; id: number } | null = null;

// ─── Types ────────────────────────────────────────────────────────────────
type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

interface CartItem { product: Product; qty: number; }
interface AppState {
  selectedId:    number;
  selectedName:  string;
  selectedPrice: number;
  items:         CartItem[];
  wishlist:      Product[];
  budget:        number;
}
interface Message {
  id:        string;
  role:      'user' | 'assistant';
  text:      string;
  toolCalls?: string[];
  ts:        number;
}

interface FloatingAssistantProps {
  onOpenCall?: () => void;
  isCallActive?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function getPrice(p: any): number {
  const v = p?.priceNum;
  return typeof v === 'number' ? v : parseFloat(String(v ?? 0));
}

function bc(channel: string, data: any) {
  try {
    const ch = new BroadcastChannel(channel);
    ch.postMessage({ ...data, _src: WIN_ID });
    ch.close();
  } catch {}
}

function loadHistory(): Message[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]').slice(-30); } catch { return []; }
}
function saveHistory(msgs: Message[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
}

const QUICK_PROMPTS = [
  'Place this in my room',
  'Show me sofas under $400',
  'Add to cart',
  'Complete the look',
  'Check my budget',
  'Show cart',
];

const TOOL_LABELS: Record<string, string | null> = {
  search_catalog:        '🔍 Searched catalog',
  select_product:        '👆 Switched product',
  place_product:         '📍 Placed in room',
  remove_placed_product: '🗑 Removed from scene',
  set_lighting:          '💡 Changed lighting',
  add_to_cart:           '🛒 Added to cart',
  remove_from_cart:      '🛒 Removed from cart',
  show_cart:             '🛒 Opened cart',
  add_to_wishlist:       '♥ Saved to wishlist',
  show_wishlist:         '♥ Opened wishlist',
  complete_the_look:     '✨ Complete the look',
  check_budget:          '💰 Budget check',
  open_collab:           '👥 Opened collab',
  go_home:               '🏠 Went home',
  just_answer:           null,
};

// ─── Actions (BroadcastChannel dispatch) ─────────────────────────────────
const Actions = {
  addToCart:      (id: number) => bc(CART_CHANNEL,     { type: 'add',              productId: id }),
  removeFromCart: (id: number) => bc(CART_CHANNEL,     { type: 'remove',           productId: id }),
  openCart:       ()           => bc(ACTION_CHANNEL,   { type: 'open_cart' }),
  openWishlist:   ()           => bc(ACTION_CHANNEL,   { type: 'open_wishlist' }),
  openCollab:     ()           => bc(ACTION_CHANNEL,   { type: 'open_collab' }),
  placeProduct:   (id?: number)=> bc(ACTION_CHANNEL,   { type: 'place_it',         productId: id }),
  addToWishlist:  (id: number) => bc(ACTION_CHANNEL,   { type: 'add_to_wishlist',  productId: id }),
  setLighting:    (p: string)  => bc(LIGHTING_CHANNEL, { type: 'lighting',         preset: p }),
  selectProduct:  (id: number) => bc(PRODUCT_CHANNEL,  { type: 'select',           productId: id }),
  searchCatalog:  (q: string)  => bc(BROWSE_CHANNEL,   { type: 'search',           query: q }),
  removeLast:     ()           => bc(ACTION_CHANNEL,   { type: 'remove_last' }),
  clearScene:     ()           => bc(ACTION_CHANNEL,   { type: 'clear_scene' }),
  goHome:         ()           => bc(ACTION_CHANNEL,   { type: 'go_home' }),
};



// Add near other Actions
const openFurnitureBrowser = (query: string, products: Product[]) => {
  const winName = `furniture-browser-${Date.now()}`;
  const data = encodeURIComponent(JSON.stringify({
    query: query,
    products: products.slice(0, 8).map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      emoji: p.emoji,
      imageUrl: p.imageUrl,
    }))
  }));
  
  const url = `/ai-suggestions?data=${data}`;
  
  if (isXRMode) {
    initScene(winName, (cfg) => ({
      ...cfg,
      defaultSize: { width: 800, height: 600 },
      defaultPosition: { x: 400, y: 0, z: 0 },
    }));
  }
  
  window.open(url, winName);
};



// ─── Tool executor ────────────────────────────────────────────────────────
async function executeTool(
  call: ToolCall,
  state: AppState,
  setCatalog: (p: Product[]) => void,
  catalog: Product[],
): Promise<string> {
  const { name, args } = call;
  const currentId = state.selectedId;

  switch (name) {
 case 'search_catalog': {
  // Handle both 'query' and 'q' parameter names
  const searchQuery = args.query ?? args.q;
  
  // Use AI-specific search for better results
  const results = await aiSearchProducts(searchQuery, 3);
  const filtered = args.maxPrice
    ? results.filter(p => getPrice(p) <= (args.maxPrice as number))
    : results;
  const list = filtered.length ? filtered : results;
  setCatalog(list);
  Actions.searchCatalog(searchQuery);
  getSession()?.send({ type: 'control_action', action: 'browse_search', data: { query: searchQuery } } as any);
  
  // Store the first result in module-level variable for "add to cart" confirmation
  if (list.length > 0) {
    lastSuggestedProductGlobal = {
      name: list[0].name,
      id: list[0].id
    };
  }
    
    // 🔥 NEW: Open furniture browser with search results
    openFurnitureBrowser(searchQuery, list);
  
  return `Found ${list.length} products for "${searchQuery}"${args.maxPrice ? ` under $${args.maxPrice}` : ''}. ${list.slice(0, 3).map(p => p.name).join(', ')}`;
}
    case 'select_product': {
      const p = PRODUCTS.find(x => x.id === args.productId);
      if (p) { Actions.selectProduct(p.id); return `Switched to ${p.name} ($${getPrice(p)}).`; }
      return 'Product not found.';
    }
    case 'place_product':
      Actions.placeProduct(currentId);
      return `Placing ${state.selectedName} in your room.`;
    case 'remove_placed_product':
      if (args.all) { Actions.clearScene(); return 'Cleared all objects from your scene.'; }
      Actions.removeLast(); return 'Removed the last placed object.';
    case 'set_lighting':
      Actions.setLighting(args.preset as string);
      getSession()?.send({ type: 'lighting_change', preset: args.preset, floor: '', wall: '' });
      return `Lighting changed to ${args.preset}.`;
case 'add_to_cart': {
  const id = (args.productId as number) ?? currentId;
  Actions.addToCart(id);
  
  // Search in local PRODUCTS and catalog
  const p = PRODUCTS.find(x => x.id === id) || catalog.find(x => x.id === id);
  
  return `Added ${p?.name ?? state.selectedName} to your cart.`;
}
    case 'remove_from_cart':
      Actions.removeFromCart(args.productId as number);
      return 'Removed from cart.';
    case 'show_cart':
      Actions.openCart(); return 'Opening your cart.';
    case 'add_to_wishlist': {
      const id = (args.productId as number) ?? currentId;
      Actions.addToWishlist(id);
      const p = PRODUCTS.find(x => x.id === id);
      return `Added ${p?.name ?? state.selectedName} to your wishlist.`;
    }
    case 'show_wishlist':
      Actions.openWishlist(); return 'Opening your wishlist.';
    case 'complete_the_look': {
      const cartTypes = state.items.map(i => i.product.type).filter(Boolean).join(' ');
      const query = cartTypes ? `complements ${cartTypes}` : 'living room furniture set';
      const results = await searchProducts(query, 12);
      setCatalog(results);
      Actions.searchCatalog(query);
      return `Here are ${results.length} products that complete your look.`;
    }
    case 'check_budget': {
      const total = state.items.reduce((s, i) => s + getPrice(i.product) * i.qty, 0);
      if (!state.budget) return `Your cart total is $${total}. No budget set.`;
      const diff = state.budget - total;
      return diff >= 0
        ? `Cart: $${total} of $${state.budget} budget — $${diff} remaining. ✓`
        : `You're $${Math.abs(diff)} over your $${state.budget} budget (cart: $${total}).`;
    }
    case 'open_collab':
      Actions.openCollab(); return 'Opening the collaboration session.';
    case 'go_home':
      Actions.goHome(); return 'Going back to the home page.';
    case 'just_answer':
      return (args.answer as string) ?? '';
    default:
      return '';
  }
}


// ─── Gemini → OpenRouter call with automatic fallback ─────────────────────
async function callGemini(userText: string, history: Message[], systemPrompt: string): Promise<ToolCall[]> {

  // 1️⃣ Try Gemini if key is present
  if (GEMINI_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
      const contents = [
        ...history.slice(-8).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
        { role: 'user', parts: [{ text: userText }] },
      ];
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ function_declarations: TOOL_DEFINITIONS }],
          tool_config: { function_calling_config: { mode: 'ANY' } },
          generationConfig: { temperature: 0.4 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const calls: ToolCall[] = [];
        for (const part of parts) {
          if (part.functionCall) calls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
        }
        if (calls.length === 0) {
          const text = parts.find((p: any) => p.text)?.text ?? '';
          if (text) calls.push({ name: 'just_answer', args: { answer: text.slice(0, 300) } });
        }
        if (calls.length > 0) return calls;
      }
      console.warn(`[Sheri] Gemini ${res.status} — switching to OpenRouter`);
    } catch (e) {
      console.warn('[Sheri] Gemini failed, switching to OpenRouter:', e);
    }
  }

  // 2️⃣ OpenRouter fallback (free, no CORS issues)
  if (!OPENROUTER_KEY) throw new Error('No AI key available. Add VITE_OPENROUTER_API_KEY to .env');

  const orMessages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userText },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Sheri Assistant',
    },
    body: JSON.stringify({ model: OR_MODEL, messages: orMessages, temperature: 0.4, max_tokens: 512 }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  return parseIntentFromText(content, userText);
}


function parseIntentFromText(aiText: string, userText: string): ToolCall[] {
  const lower = userText.toLowerCase();
  
  // 🔥 FIRST: Try to extract JSON tool call from AI response
  try {
    const jsonMatch = aiText.match(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*\}\s*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[Sheri] Extracted tool call:', parsed);
      if (parsed.tool && parsed.arguments) {
        if (parsed.tool === 'search_catalog' && parsed.arguments.q && !parsed.arguments.query) {
          parsed.arguments.query = parsed.arguments.q;
        }
        return [{ name: parsed.tool, args: parsed.arguments }];
      }
    }
  } catch (e) {}
  
  // 🔥 NEW: Handle text format like "search_catalog: house plants" or "tool: search_catalog, query: house plants"
  const toolMatch = aiText.toLowerCase().match(/(?:tool:\s*)?(search_catalog|place_product|add_to_cart|show_cart|check_budget|complete_the_look|set_lighting)\s*:?\s*(.*)/);
  if (toolMatch) {
    const toolName = toolMatch[1];
    let query = toolMatch[2].trim();
    // Remove extra quotes
    query = query.replace(/^["']|["']$/g, '');
    console.log('[Sheri] Extracted tool from text:', toolName, query);
    return [{ name: toolName, args: { query: query || 'furniture' } }];
  }
  
  // 🔥 Check for "yes" confirmation
  if ((/yes|sure|please|go ahead|add it|i'll take it|yeah/.test(lower)) && lastSuggestedProductGlobal) {
    const productId = lastSuggestedProductGlobal.id;
    lastSuggestedProductGlobal = null;
    return [{ name: 'add_to_cart', args: { productId } }];
  }
  
  if (/add to cart|buy|i.ll take it|purchase/.test(lower)) return [{ name: 'add_to_cart', args: {} }];
  if (/place|try in my room|put it/.test(lower))           return [{ name: 'place_product', args: {} }];
  if (/show cart|open cart/.test(lower))                   return [{ name: 'show_cart', args: {} }];
  if (/budget|afford|how much/.test(lower))                return [{ name: 'check_budget', args: {} }];
  if (/wishlist|save it|save for later/.test(lower))       return [{ name: 'add_to_wishlist', args: {} }];
  if (/complete the look|match|goes with/.test(lower))     return [{ name: 'complete_the_look', args: {} }];
  if (/lighting|lights|bright|dim/.test(lower))            return [{ name: 'set_lighting', args: { preset: lower.includes('dim') ? 'evening' : 'daylight' } }];
  
  const searchMatch = lower.match(/(?:show me|find|search for|look for|suggest|recommend) (.+)/);
  if (searchMatch) {
    let query = searchMatch[1];
    query = query.replace(/some|a|an|that would|that would compliment|my room$/g, '').trim();
    return [{ name: 'search_catalog', args: { query: query } }];
  }
  
  return [{ name: 'just_answer', args: { answer: aiText.slice(0, 300) } }];
}


// ─── Web Audio helpers (no external deps) ─────────────────────────────────
function createAudioCtx(): AudioContext | null {
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); }
  catch { return null; }
}
function playVoiceClick(ctx: AudioContext, starting: boolean) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  if (starting) {
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.setValueAtTime(900, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } else {
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.setValueAtTime(400, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  }
}
function playChime(ctx: AudioContext) {
  [523, 659, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine'; osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.start(t); osc.stop(t + 0.4);
  });
}
function startProcessingHum(ctx: AudioContext): () => void {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = 200;
  gain.gain.value = 0.03;
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start();
  return () => { try { osc.stop(); } catch {} };
}


// ─── Orb visual ───────────────────────────────────────────────────────────
function Orb({ orbState, bars, onClick }: {
  orbState: OrbState; bars: number[]; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`floating-assistant-orb floating-assistant-orb--${orbState}`}
    >
      {/* Ambient aura — outermost glow layer */}
      <div className="floating-assistant-orb-aura" />
      {/* Crisp outer ring */}
      <div className="floating-assistant-orb-ring" />
      <div className="floating-assistant-orb-body">
        {orbState === 'listening' ? (
          /* Waveform mic icon — active listening */
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="10" y="2" width="8" height="13" rx="4"
              fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6"/>
            <path d="M5 13a9 9 0 0 0 18 0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6"/>
            <line x1="14" y1="22" x2="14" y2="26" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6"/>
            <line x1="10" y1="26" x2="18" y2="26" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6"/>
          </svg>
        ) : orbState === 'speaking' ? (
          /* Sound wave icon */
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none" strokeLinecap="round">
            <path d="M4 10v8M8 7v14M12 5v18M16 7v14M20 10v8M24 12v4"
              stroke="rgba(255,255,255,0.9)" strokeWidth="1.8"/>
          </svg>
        ) : orbState === 'processing' ? (
          /* Sparkle / thinking icon */
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none">
            <path d="M14 3 L15.5 10 L22 11.5 L15.5 13 L14 20 L12.5 13 L6 11.5 L12.5 10 Z"
              fill="rgba(255,255,255,0.9)" stroke="none"/>
            <circle cx="22" cy="7" r="2" fill="rgba(255,255,255,0.55)"/>
            <circle cx="7" cy="21" r="1.5" fill="rgba(255,255,255,0.45)"/>
          </svg>
        ) : (
          /* Idle — refined AI orb symbol */
          <svg viewBox="0 0 28 28" width="22" height="22" fill="none">
            {/* Outer arc */}
            <circle cx="14" cy="14" r="9.5"
              stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"
              strokeDasharray="18 42" strokeLinecap="round"
              style={{ transform: 'rotate(-30deg)', transformOrigin: '14px 14px' }}/>
            {/* Inner dot cluster */}
            <circle cx="14" cy="14" r="3" fill="rgba(0,60,30,0.7)"/>
            <circle cx="14" cy="14" r="1.5" fill="rgba(255,255,255,0.85)"/>
            <circle cx="14" cy="7.5" r="1.2" fill="rgba(255,255,255,0.5)"/>
            <circle cx="19.5" cy="17" r="0.9" fill="rgba(255,255,255,0.35)"/>
            <circle cx="8.5" cy="17" r="0.9" fill="rgba(255,255,255,0.35)"/>
          </svg>
        )}
        {(orbState === 'listening' || orbState === 'speaking') && (
          <div className="floating-assistant-orb-bars">
            {bars.map((h, i) => (
              <div key={i} className="floating-assistant-orb-bar" style={{ height: Math.max(3, h * 12) }} />
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── iMessage bubble ──────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`floating-assistant-bubble floating-assistant-bubble--${isUser ? 'user' : 'assistant'}`}>
      <div className="floating-assistant-bubble-content">
        {msg.text}
        {msg.toolCalls?.map(t => TOOL_LABELS[t]).filter(Boolean).map((label, i) => (
          <div key={i} className="floating-assistant-bubble-badge">{label}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function FloatingAssistant({ onOpenCall, isCallActive }: FloatingAssistantProps) {
  const [open,         setOpen]         = useState(false);
  const [orbState,     setOrbState]     = useState<OrbState>('idle');
  const [messages,     setMessages]     = useState<Message[]>(loadHistory);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [listening,    setListening]    = useState(false);
  const [speaking,     setSpeaking]     = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [tier,         setTier]         = useState<'local' | 'gemini' | null>(null);
  const [bars,         setBars]         = useState<number[]>(Array(7).fill(0));
  const [catalog,      setCatalog]      = useState<Product[]>(PRODUCTS);
  const [appState, setAppState] = useState<AppState>({
    selectedId:    PRODUCTS[2].id,
    selectedName:  PRODUCTS[2].name,
    selectedPrice: getPrice(PRODUCTS[2]),
    items:         [],
    wishlist:      [],
    budget:        Number(localStorage.getItem(BUDGET_KEY) ?? '0'),
  });

  const appStateRef  = useRef<AppState>(appState);
  const catalogRef   = useRef<Product[]>(PRODUCTS);
  const feedRef      = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const recRef        = useRef<any>(null);
  const silenceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const stopHumRef    = useRef<(() => void) | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const rafRef        = useRef<number>(0);
  // ── Audio/mic permission state ─────────────────────────────────────
  // micStreamRef: reuse the same MediaStream so getUserMedia fires ONCE.
  // Safari asks twice if AudioContext is created separately from getUserMedia.
  // Solution: create AudioContext from the stream, not independently.
  const micStreamRef  = useRef<MediaStream | null>(null);
  const micPrimedRef  = useRef(false);        // true after first permission grant
  // ── Double-send guard ──────────────────────────────────────────────
  // Prevents the same voice utterance firing sendMessage twice
  // (race between silence-timer and a stale onresult closure).
  const voiceSentRef  = useRef(false);

  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { catalogRef.current = catalog;   }, [catalog]);
useEffect(() => {
  if (inputRef.current && inputRef.current.value !== input) {
    inputRef.current.value = input;
  }
}, [input]);
  useEffect(() => {
    if (listening)      setOrbState('listening');
    else if (loading)   setOrbState('processing');
    else if (speaking)  setOrbState('speaking');
    else                setOrbState('idle');
  }, [listening, loading, speaking]);

// ── CART CHANNEL — update state from main app ──────────────────────────────
useEffect(() => {
  const ch = new BroadcastChannel(CART_CHANNEL);
  ch.onmessage = (e) => {
    // console.log('[FloatingAssistant] CART_CHANNEL message:', e.data);
    if (e.data?.type === 'state') {
      // console.log('[FloatingAssistant] CART_CHANNEL is updating appState');
      
      setAppState(prev => ({
        // Always update items and wishlist from the message
        items: e.data.items ?? prev.items,
        wishlist: e.data.wishlist ?? prev.wishlist,
        budget: e.data.budget ?? prev.budget,
        
        // 🔥 CRITICAL: Only update selected fields if they have valid values
        selectedId: e.data.selectedId ?? prev.selectedId,
        selectedName: (e.data.selectedName && e.data.selectedName !== '') 
          ? e.data.selectedName 
          : prev.selectedName,
        selectedPrice: e.data.selectedPrice ?? prev.selectedPrice,
      }));
    }
  };
  return () => ch.close();
}, []);
  // Add this with the other channel listeners (around line 500-520)
// Listen for product selection from Fashion Browser or other windows
useEffect(() => {
  const ch = new BroadcastChannel(PRODUCT_CHANNEL);
  ch.onmessage = async (e) => {
    console.log('[FloatingAssistant] PRODUCT_CHANNEL received:', e.data);
    if (e.data?.type === 'select' && e.data.productId != null) {
      // First try local PRODUCTS
      let p = PRODUCTS.find(p => p.id === e.data.productId);
      
      // If not found, try to find in catalog state
      if (!p && catalog.length > 0) {
        p = catalog.find(p => p.id === e.data.productId);
      }
      
      // If still not found, try to load from IKEA API
      if (!p) {
        try {
          const { getProductDetails } = await import('./ikeaApi');
          const detail = await getProductDetails(String(e.data.productId));
          if (detail) {
            p = {
              id: e.data.productId,
              name: detail.productName,
              price: `$${detail.productPrice}`,
              priceNum: detail.productPrice,
              emoji: '🪑',
              type: 'Furniture',
              fullType: detail.productName,
              description: detail.description,
              rating: detail.rating.average,
              designer: detail.designerName,
              imageUrl: detail.gallery?.[0],
              category: 'Furniture',
            } as Product;
          }
        } catch (err) {
          console.warn('[FloatingAssistant] Failed to load product details:', err);
        }
      }
      
      if (p) {
        console.log('[FloatingAssistant] Updating selected product to:', p.name);
        setAppState(prev => ({
          ...prev,
          selectedId: p.id,
          selectedName: p.name,
          selectedPrice: getPrice(p),
        }));
      } else {
        console.warn('[FloatingAssistant] Product not found for ID:', e.data.productId);
      }
    }
  };
  return () => ch.close();
}, [catalog]); // Add catalog as dependency


useEffect(() => {
  console.log('[FloatingAssistant] appState.selectedName changed to:', appState.selectedName);
}, [appState.selectedName]);

  useEffect(() => {
    feedRef.current?.scrollTo(0, feedRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 160);
  }, [open]);

  useEffect(() => {
    browseCategory('All', 20).then(p => { if (p.length) setCatalog(p); }).catch(() => {});
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    stopHumRef.current?.();
    audioCtxRef.current?.close();
  }, []);

  // ── primeAudio: single unified permission request ─────────────────
  // Must be called from a direct user-gesture handler (onClick).
  // • Calls getUserMedia ONCE — stored in micStreamRef for reuse.
  // • Creates AudioContext from the stream so Safari only shows ONE prompt.
  // • On Brave/PICO: AudioContext starts suspended — we resume it here.
  // • Subsequent calls are instant no-ops (micPrimedRef guard).
  const primeAudio = async (): Promise<AudioContext | null> => {
    // Already primed — just ensure ctx is running
    if (micPrimedRef.current && audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    }

    try {
      // Single getUserMedia call — covers SpeechRecognition permission too
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Create AudioContext from stream (avoids a second Safari permission prompt)
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      audioCtxRef.current = ctx;

      // Brave / PICO WebView: context may still be suspended even after creation
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      micPrimedRef.current = true;
      return ctx;
    } catch (err) {
      console.warn('[Sheri] mic permission denied or AudioContext failed:', err);
      // Fallback: create AudioContext without mic (no visualiser, sounds may still work)
      if (!audioCtxRef.current) {
        try {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          if (AC) {
            audioCtxRef.current = new AC();
            await audioCtxRef.current.resume().catch(() => {});
          }
        } catch {}
      }
      return audioCtxRef.current;
    }
  };

  // getAudioCtx: sync accessor for already-created context (used by sound fns)
  const getAudioCtx = () => audioCtxRef.current;

  const startMicBars = () => {
    const stream = micStreamRef.current;
    const ctx    = audioCtxRef.current;
    if (!stream || !ctx) {
      // Permission not yet granted or context missing — show random bars
      const tick = () => {
        setBars(Array(7).fill(0).map(() => 0.1 + Math.random() * 0.7));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      return;
    }
    try {
      const src     = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setBars(Array.from(data.slice(0, 7)).map(v => v / 255));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      const tick = () => {
        setBars(Array(7).fill(0).map(() => 0.1 + Math.random() * 0.7));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    }
  };
  const stopMicBars = () => {
    cancelAnimationFrame(rafRef.current);
    setBars(Array(7).fill(0));
    analyserRef.current = null;
  };

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !text) return;
    window.speechSynthesis?.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-US'; utt.rate = 1.0; utt.pitch = 1.1;
    utt.onstart = () => setSpeaking(true);
    utt.onend   = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [voiceEnabled]);

  const buildSystemPrompt = useCallback(() => {
    const state = appStateRef.current;
    const cartTotal = state.items.reduce((s, i) => s + getPrice(i.product) * i.qty, 0);
    const cartList  = state.items.map(i => `${i.product.name} x${i.qty} $${getPrice(i.product)}`).join(', ') || 'empty';
    const catSummary = catalogRef.current.slice(0, 20)
      .map(p => `id:${p.id} "${p.name}" ${p.type} $${getPrice(p)}`).join(' | ');
    return `You are Sheri, a warm AI spatial furniture shopping assistant in a PICO XR headset.
ALWAYS call at least one tool. Use just_answer only when no action is needed.
Keep just_answer text to 2 sentences max.

Current state:
- Viewing: ${state.selectedName} id:${state.selectedId} $${state.selectedPrice}
- Cart (${state.items.length} items, total $${cartTotal}): ${cartList}
- Budget: ${state.budget > 0 ? `$${state.budget} (${cartTotal > state.budget ? `OVER by $${cartTotal - state.budget}` : `$${state.budget - cartTotal} left`})` : 'not set'}
- Wishlist: ${state.wishlist.length} items
Catalog (${catalogRef.current.length} products): ${catSummary}

Rules:
- "add to cart"/"buy"/"I'll take it" → add_to_cart
- "does it match my budget"/"can I afford" → check_budget
- "show cart"/"open cart" → show_cart
- "place"/"try in my room" → place_product
- "remove"/"I don't like it" → remove_placed_product then search_catalog
- "complete the look" → complete_the_look
- "lighting" → set_lighting
- Only use product ids from the catalog list above`;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);
    setTier(null);

    const userMsg: Message = { id: `${Date.now()}`, role:'user', text: text.trim(), ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    saveHistory(next);
    getSession()?.send({ type:'assistant_message', text: text.trim(), isUser:true, by: getSession()!.id });

    const ctx = getAudioCtx();
    if (ctx) stopHumRef.current = startProcessingHum(ctx);

    try {
      const state = appStateRef.current;

      const localCall = localRouter(text);
      if (localCall) {
        setTier('local');
        stopHumRef.current?.(); stopHumRef.current = null;
const result = await executeTool(localCall, state, setCatalog, catalog);
        if (result) speak(result);
        if (ctx) playChime(ctx);
        const msg: Message = { id:`${Date.now()}-a`, role:'assistant', text: result || '✓ Done.', toolCalls:[localCall.name], ts: Date.now() };
        const withReply = [...next, msg];
        setMessages(withReply);
        saveHistory(withReply);
        getSession()?.send({ type:'assistant_message', text: msg.text, isUser:false, by:'sheri' });
        return;
      }

      if (!GEMINI_KEY) throw new Error('Add VITE_GEMINI_API_KEY to .env');
      setTier('gemini');
      const calls = await callGemini(text, messages, buildSystemPrompt());
      console.log('[Sheri] Tool calls received:', JSON.stringify(calls));

      stopHumRef.current?.(); stopHumRef.current = null;

      const results: string[] = [];
      const tools: string[] = [];
      for (const call of calls) {
const r = await executeTool(call, state, setCatalog, catalog);
        if (r) results.push(r);
        tools.push(call.name);
      }

      const responseText = results.join(' ').trim() || '✓';
      speak(responseText);
      console.log(responseText);
      if (ctx) playChime(ctx);

      const msg: Message = { id:`${Date.now()}-a`, role:'assistant', text: responseText, toolCalls: tools, ts: Date.now() };
      const withReply = [...next, msg];
      setMessages(withReply);
      saveHistory(withReply);
      getSession()?.send({ type:'assistant_message', text: responseText, isUser:false, by:'sheri' });

  

    } catch (err) {
      stopHumRef.current?.(); stopHumRef.current = null;
      const errText = err instanceof Error ? `⚠ ${err.message}` : '⚠ Something went wrong.';
      setMessages(prev => [...prev, { id:`${Date.now()}-err`, role:'assistant', text: errText, ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTier(null);
    }
  }, [loading, messages, buildSystemPrompt, speak]);

  const toggleVoice = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // ── Stop branch ───────────────────────────────────────────────────
   if (listening) {
  console.log('[Sheri] Manually stopping');
  const ctx = getAudioCtx();
  if (ctx) playVoiceClick(ctx, false);
  if (silenceRef.current) clearTimeout(silenceRef.current);
  if (recRef.current) {
    try {
      recRef.current.stop();
      recRef.current = null;
    } catch (e) {}
  }
  
  // Force cleanup
  stopMicBars();
  setListening(false);
  setOrbState('idle');
  
  // Stop media tracks
  if (micStreamRef.current) {
    micStreamRef.current.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
  }
  
  micPrimedRef.current = false;
  return;
}

    if (!SR) {
      console.warn('[Sheri] SpeechRecognition not supported on this browser/platform');
      return;
    }

    // ── Prime audio FIRST (single permission request, must be in gesture) ──
    // This awaits getUserMedia + AudioContext creation in one shot.
    // Safari will show ONE prompt. Brave/PICO will unlock AudioContext.
    const ctx = await primeAudio();
    if (ctx) playVoiceClick(ctx, true);

    // ── Start recognition ─────────────────────────────────────────────
    voiceSentRef.current = false; // reset double-send guard for this session
    const rec = new SR();
    rec.lang            = 'en-US';
    rec.continuous      = !isXRMode;
    rec.interimResults  = true;
    if ('maxAlternatives' in rec) rec.maxAlternatives = 1; // PICO/Android WebView

    rec.onresult = (e: any) => {
      if (voiceSentRef.current) return;
      if (silenceRef.current) clearTimeout(silenceRef.current);
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      let cur = (final + interim).trim();
      if (!cur) return;
      setInput(cur);

    

     // Silence timer — auto-send after pause
    // Silence timer — auto-send after pause
silenceRef.current = setTimeout(() => {
  if (voiceSentRef.current) return;
  voiceSentRef.current = true;

  const finalText = cur;

  // 1. STOP recognition FIRST (important)
  if (recRef.current) {
    try { recRef.current.onresult = null; } catch {}
    try { recRef.current.stop(); } catch {}
    recRef.current = null;
  }

  // 2. stop mic visual
  stopMicBars();

  // 3. clear input AFTER voice is fully dead
  setInput('');

  // 4. reset UI
  setListening(false);
  setOrbState('idle');

  // 5. send

    // Additional cleanup: stop any media tracks
  if (micStreamRef.current) {
    micStreamRef.current.getTracks().forEach(track => {
      if (track.readyState === 'live' && track.kind === 'audio') {
        console.log('[Sheri] Stopping audio track');
        track.stop();
      }
    });
    micStreamRef.current = null;
  }
  
  // Close audio context if needed
  if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
    audioCtxRef.current.close().catch(() => {});
    audioCtxRef.current = null;
  }
  
  micPrimedRef.current = false; // Reset permission flag

  sendMessage(finalText);

}, isXRMode ? 2000 : 1500);
    };

    rec.onerror = (e: any) => {
      // 'not-allowed': user denied. 'no-speech': silence timeout from browser.
      if (e.error === 'not-allowed') {
        console.warn('[Sheri] Mic permission denied in SpeechRecognition');
      }
      recRef.current = null;
      setListening(false);
      stopMicBars();
    };

   rec.onend = () => {
  if (voiceSentRef.current) return;
  recRef.current = null;
  setListening(false);
  stopMicBars();
};

    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      // Already started (can happen on rapid double-tap)
      console.warn('[Sheri] rec.start() threw:', err);
      recRef.current = null;
      return;
    }

    setListening(true);
    startMicBars();
    setOpen(true);
  }, [listening, sendMessage]);

  const handleOrbClick = useCallback(async () => {
    // toggleVoice calls primeAudio internally and plays the click sound.
    // Just ensure panel is open, then delegate entirely.
    if (!open) setOpen(true);
    await toggleVoice();
  }, [open, toggleVoice]);

  const cartTotal = appState.items.reduce((s, i) => s + getPrice(i.product) * i.qty, 0);

  return (
    <>
    
      {open && (
        
        <div className="floating-assistant-panel">
          <style>{`
            @keyframes fa-rise { from{opacity:0;transform:translateY(14px) scale(0.96)} to{opacity:1;transform:none} }
          `}</style>

          <div className="floating-assistant-header">
            <div className="floating-assistant-status">
              <div className={`floating-assistant-status-dot floating-assistant-status-dot--${orbState}`} />
              <span className="floating-assistant-status-label">Sheri · {orbState === 'idle' ? 'Ready' : orbState === 'listening' ? 'Listening…' : orbState === 'processing' ? 'Thinking…' : 'Speaking…'}</span>
              {tier && (
                <span className={`floating-assistant-tier floating-assistant-tier--${tier}`}>
                  {tier === 'gemini' ? '🧠 Gemini' : '⚡ Local'}
                </span>
              )}
            </div>

            <div className="floating-assistant-actions">
              <span className="floating-assistant-context">{appState.selectedName}</span>
              {appState.items.length > 0 && (
                <button onClick={Actions.openCart} className="floating-assistant-cart-pill">
                  🛒 {appState.items.length} · ${cartTotal}
                </button>
              )}
              {appState.budget > 0 && (
                <span className={`floating-assistant-budget-pill ${cartTotal > appState.budget ? 'floating-assistant-budget-pill--over' : ''}`}>
                  {cartTotal > appState.budget ? `Over $${cartTotal - appState.budget}` : `$${appState.budget - cartTotal} left`}
                </span>
              )}
              <button onClick={() => { setVoiceEnabled(v => !v); window.speechSynthesis?.cancel(); setSpeaking(false); }} className="floating-assistant-voice-toggle">
                {voiceEnabled ? '🔊' : '🔇'}
              </button>
              <button onClick={() => { setMessages([]); saveHistory([]); window.speechSynthesis?.cancel(); setSpeaking(false); }} className="floating-assistant-clear-btn">⊗</button>
              <button onClick={() => setOpen(false)} className="floating-assistant-close-btn">✕</button>
            </div>
          </div>

          <div ref={feedRef} className="floating-assistant-feed">
            {messages.length === 0 && (
              <div className="floating-assistant-welcome">
                <div className="floating-assistant-welcome-orb" />
                <p className="floating-assistant-welcome-text">
                  <strong>Hi, I'm Sheri.</strong><br/>
                  Tap a command or ask me anything.
                </p>
                <div className="floating-assistant-commands-grid">
                  {[
                    { icon: '🛋️', label: 'Place in room', desc: 'Try AR placement', prompt: 'Place this in my room', color: 'blue' },
                    { icon: '🔍', label: 'Search catalog', desc: 'Find products', prompt: 'Show me sofas under $400', color: 'teal' },
                    { icon: '🛒', label: 'Add to cart', desc: 'Selected item', prompt: 'Add to cart', color: 'green' },
                    { icon: '✨', label: 'Complete look', desc: 'Match the style', prompt: 'Complete the look', color: 'violet' },
                    { icon: '💰', label: 'Check budget', desc: 'Track spending', prompt: 'Check my budget', color: 'amber' },
                    { icon: '💡', label: 'Set lighting', desc: 'Change ambiance', prompt: 'Set lighting to daylight', color: 'rose' },
                  ].map(cmd => (
                    <button
                      key={cmd.prompt}
                      className={`floating-assistant-command-card floating-assistant-command-card--${cmd.color}`}
                      onClick={() => sendMessage(cmd.prompt)}
                    >
                      <span className="floating-assistant-command-icon">{cmd.icon}</span>
                      <span className="floating-assistant-command-label">{cmd.label}</span>
                      <span className="floating-assistant-command-desc">{cmd.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
            {loading && (
              <div className="floating-assistant-loading">
                <div className="floating-assistant-loading-bubble">
                  {tier === 'gemini'
                    ? <span className="floating-assistant-loading-text">🧠 Sheri is thinking…</span>
                    : <span className="floating-assistant-loading-dots">···</span>}
                </div>
              </div>
            )}
          </div>

          <div className="floating-assistant-quick-prompts">
            {QUICK_PROMPTS.map(q => (
              <button key={q} onClick={() => sendMessage(q)} className="floating-assistant-quick-prompt">{q}</button>
            ))}
          </div>

          <div className="floating-assistant-input-row">
            <button onClick={() => { void toggleVoice(); }} className={`floating-assistant-mic-btn ${listening ? 'floating-assistant-mic-btn--active' : ''}`}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0M12 21v-4M8 21h8"/>
              </svg>
            </button>
            <input
              ref={inputRef}
              className="floating-assistant-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) sendMessage(input); }}
              placeholder={listening ? 'Listening…' : 'Ask Sheri anything…'}
              disabled={loading}
            />
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} className={`floating-assistant-send-btn ${input.trim() && !loading ? 'floating-assistant-send-btn--active' : ''}`}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="floating-assistant-orb-container">
        <Orb orbState={orbState} bars={bars} onClick={handleOrbClick} />

        {!open && (
          <div className="floating-assistant-orb-label">
            Sheri · {orbState === 'idle' ? 'Ready' : orbState === 'listening' ? 'Listening…' : orbState === 'processing' ? 'Thinking…' : 'Speaking…'}
          </div>
        )}

        {!isCallActive && onOpenCall && (
          <button onClick={onOpenCall} className="floating-assistant-call-btn" title="Join Call">📞</button>
        )}
      </div>
    </>
  );
}