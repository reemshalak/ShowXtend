/**
 * assistantActions.ts
 *
 * Single source of truth for all actions + the local keyword router.
 *
 * ROUTER PHILOSOPHY:
 * Catch every reasonable human phrasing for common UI actions locally.
 * Gemini is ONLY called when the intent genuinely needs reasoning
 * (product search, design advice, budget math from natural language).
 * Voice input produces imprecise words — the router must be forgiving.
 */

import type { Product } from './data';
import { PRODUCTS } from './data';
import { searchProducts } from './ikeaApi';
import { getSession } from './collaboration';

const PRODUCT_CHANNEL  = 'catalog-product-select';
const WISHLIST_CHANNEL = 'wishlist-channel';
const LIGHTING_CHANNEL = 'lighting-channel';
const ACTION_CHANNEL   = 'assistant-action';
const CART_CHANNEL     = 'cart-channel';
const BROWSE_CHANNEL   = 'browse-search-channel';

function bc(channel: string, data: any) {
  try { const ch = new BroadcastChannel(channel); ch.postMessage(data); ch.close(); } catch {}
}

export interface AppContext {
  currentProduct:    Product;
  catalog:           Product[];
  cartItems:         CartItem[];
  wishlistItems:     Product[];
  budget:            number;
  setCatalog:        (p: Product[]) => void;
  setCurrentProduct: (p: Product) => void;
  addToCart:         (p: Product) => void;
  removeFromCart:    (id: number) => void;
  addToWishlist:     (p: Product) => void;
  openCart:          () => void;
  openWishlist:      () => void;
  openCollab:        () => void;
  speak:             (text: string) => void;
}

export interface CartItem { product: Product; qty: number; }

export const TOOL_DEFINITIONS = [
  {
    name: 'search_catalog',
    description: 'Search the IKEA catalog for furniture matching a query. Use when user asks to find, show, or browse products.',
    parameters: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Search query' },
        maxPrice: { type: 'number', description: 'Max price in USD if user mentions budget' },
      },
      required: ['query'],
    },
  },
  {
    name: 'select_product',
    description: 'Switch the currently viewed product.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'number' } },
      required: ['productId'],
    },
  },
  {
    name: 'place_product',
    description: 'Place the current product in the AR room view.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'remove_placed_product',
    description: 'Remove placed object(s) from the AR scene.',
    parameters: {
      type: 'object',
      properties: { all: { type: 'boolean' } },
      required: [],
    },
  },
  {
    name: 'set_lighting',
    description: 'Change room lighting preset.',
    parameters: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['warm', 'cool', 'daylight', 'evening', 'showroom'] },
      },
      required: ['preset'],
    },
  },
  {
    name: 'add_to_wishlist',
    description: 'Add current or specific product to wishlist.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'number' } },
      required: [],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add current or specific product to shopping cart.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'number' } },
      required: [],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a product from the cart.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'number' } },
      required: ['productId'],
    },
  },
  {
    name: 'show_cart',
    description: 'Open the shopping cart panel.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'show_wishlist',
    description: 'Open the wishlist panel.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'complete_the_look',
    description: 'Suggest products complementing what is already in cart or scene.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_budget',
    description: 'Check if cart total fits within user budget.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'go_home',
    description: 'Navigate back to the home / browse page.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'open_collab',
    description: 'Open the collaboration session panel.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'just_answer',
    description: 'Provide a helpful text answer with no UI action needed.',
    parameters: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    },
  },
] as const;

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export async function executeToolCall(call: ToolCall, ctx: AppContext): Promise<string> {
  const { name, args } = call;
  switch (name) {
    case 'search_catalog': {
      const results = await searchProducts(args.query as string, 24);
      const filtered = args.maxPrice ? results.filter(p => (Number(p.priceNum) || 0) <= args.maxPrice) : results;
      const list = filtered.length ? filtered : results;
      ctx.setCatalog(list);
      bc(BROWSE_CHANNEL, { type: 'search', query: args.query });
      getSession()?.send({ type: 'control_action', action: 'browse_search', data: { query: args.query } } as any);
      return `Found ${list.length} products for "${args.query}"${args.maxPrice ? ` under $${args.maxPrice}` : ''}.`;
    }
    case 'select_product': {
      const p = ctx.catalog.find(x => x.id === args.productId) ?? PRODUCTS.find(x => x.id === args.productId);
      if (p) {
        ctx.setCurrentProduct(p);
        bc(PRODUCT_CHANNEL, { type: 'select', productId: p.id });
        getSession()?.send({ type: 'control_action', action: 'select_product', data: { productId: p.id } } as any);
        return `Switched to ${p.name} ($${Number(p.priceNum) || 0}).`;
      }
      return 'Product not found.';
    }
    case 'place_product': {
      bc(ACTION_CHANNEL, { type: 'place_it', productId: ctx.currentProduct.id });
      getSession()?.send({ type: 'control_action', action: 'place_product', data: { productId: ctx.currentProduct.id } } as any);
      return `Placing ${ctx.currentProduct.name} in your room.`;
    }
    case 'remove_placed_product': {
      bc(ACTION_CHANNEL, { type: args.all ? 'clear_scene' : 'remove_last' });
      getSession()?.send({ type: 'control_action', action: args.all ? 'clear_scene' : 'remove_last', data: {} } as any);
      return args.all ? 'Cleared all objects from your scene.' : 'Removed the last placed object.';
    }
    case 'set_lighting': {
      bc(LIGHTING_CHANNEL, { type: 'lighting', preset: args.preset });
      getSession()?.send({ type: 'lighting_change', preset: args.preset, floor: '', wall: '' });
      return `Lighting changed to ${args.preset}.`;
    }
    case 'add_to_wishlist': {
      const p = args.productId
        ? (ctx.catalog.find(x => x.id === args.productId) ?? ctx.currentProduct)
        : ctx.currentProduct;
      ctx.addToWishlist(p);
      bc(WISHLIST_CHANNEL, { type: 'add', productId: p.id });
      getSession()?.send({ type: 'control_action', action: 'add_to_wishlist', data: { productId: p.id } } as any);
      return `Saved ${p.name} to your wishlist.`;
    }
    case 'add_to_cart': {
      const p = args.productId
        ? (ctx.catalog.find(x => x.id === args.productId) ?? ctx.currentProduct)
        : ctx.currentProduct;
      ctx.addToCart(p);
      bc(CART_CHANNEL, { type: 'add', productId: p.id });
      getSession()?.send({ type: 'control_action', action: 'add_to_cart', data: { productId: p.id } } as any);
      return `Added ${p.name} ($${Number(p.priceNum) || 0}) to your cart.`;
    }
    case 'remove_from_cart': {
      ctx.removeFromCart(args.productId as number);
      bc(CART_CHANNEL, { type: 'remove', productId: args.productId });
      getSession()?.send({ type: 'control_action', action: 'remove_from_cart', data: { productId: args.productId } } as any);
      return 'Removed from cart.';
    }
    case 'show_cart': {
      ctx.openCart();
      bc(CART_CHANNEL, { type: 'open' });
      getSession()?.send({ type: 'control_action', action: 'show_cart', data: {} } as any);
      return 'Opening your cart.';
    }
    case 'show_wishlist': {
      ctx.openWishlist();
      getSession()?.send({ type: 'control_action', action: 'show_wishlist', data: {} } as any);
      return 'Opening your wishlist.';
    }
    case 'complete_the_look': {
      const cartTypes = ctx.cartItems.map(i => i.product.type).filter(Boolean).join(' ');
      const query = cartTypes ? `goes with ${cartTypes}` : 'living room furniture set';
      const results = await searchProducts(query, 12);
      ctx.setCatalog(results);
      bc(BROWSE_CHANNEL, { type: 'search', query });
      getSession()?.send({ type: 'control_action', action: 'browse_search', data: { query } } as any);
      return `Here are ${results.length} products that complement your selection.`;
    }
    case 'check_budget': {
      const cartTotal = ctx.cartItems.reduce((s, i) => s + (Number(i.product.priceNum) || 0) * i.qty, 0);
      const result = !ctx.budget 
        ? `Your cart total is $${cartTotal}. No budget set.`
        : ctx.budget - cartTotal >= 0
          ? `Cart: $${cartTotal} of your $${ctx.budget} budget — $${ctx.budget - cartTotal} remaining. ✓`
          : `You're $${Math.abs(ctx.budget - cartTotal)} over your $${ctx.budget} budget (cart total: $${cartTotal}).`;
      getSession()?.send({ type: 'control_action', action: 'check_budget', data: { result, cartTotal, budget: ctx.budget } } as any);
      return result;
    }
    case 'go_home': {
      bc(ACTION_CHANNEL, { type: 'go_home' });
      getSession()?.send({ type: 'control_action', action: 'go_home', data: {} } as any);
      return 'Going back to the home page.';
    }
    case 'open_collab': {
      ctx.openCollab();
      getSession()?.send({ type: 'control_action', action: 'open_collab', data: {} } as any);
      return 'Opening the collaboration session.';
    }
    case 'just_answer':
      return (args.answer as string) ?? '';
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL KEYWORD ROUTER
// Handles every common voice/text phrasing without calling Gemini.
// Returns a ToolCall if matched, null if Gemini should handle it.
//
// Strategy:
//   - Normalise text (lowercase, strip punctuation, collapse spaces)
//   - Check broad word/phrase presence — don't require exact order
//   - "card" is a common mishear/mistype of "cart" — treat identically
//   - Lighting presets matched by mood words, not just preset names
// ─────────────────────────────────────────────────────────────────────────────
export function localRouter(rawText: string): ToolCall | null {
  // Normalise: lowercase, remove punctuation (keep spaces), collapse whitespace
  const t = rawText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const has   = (...words: string[]) => words.every(w => t.includes(w));
  const any   = (...words: string[]) => words.some(w => t.includes(w));
  const starts = (...words: string[]) => words.some(w => t.startsWith(w));

  // ── CART (also catches "card" — common voice misrecognition) ────────────────
  const cartWord = any('cart', 'card', 'basket', 'bag', 'trolley');

  if (cartWord && any('show', 'open', 'see', 'view', 'check', 'what', 'display', 'my'))
    return { name: 'show_cart', args: {} };

  if (cartWord && any('add', 'put', 'include', 'buy', 'get', 'take', 'order', 'purchase'))
    return { name: 'add_to_cart', args: {} };

  if (cartWord && any('remove', 'delete', 'clear', 'empty', 'take out'))
    return { name: 'remove_from_cart', args: { productId: -1 } }; // CenterPanel handles -1 as "remove last"

  // "Add to cart" / "buy this" / "I'll take it" / "I want this" without explicit cart word
  if (any('add to cart', 'add to my cart', 'buy this', 'buy it', 'purchase this',
          'order this', 'i want this', 'i ll take it', 'i will take it', 'get this'))
    return { name: 'add_to_cart', args: {} };

  // ── WISHLIST ──────────────────────────────────────────────────────────────
const wishWord = any('wish', 'wishlist', 'wish list', 'favourite', 'favorite', 'saved', 'save list', 'liked');

if (wishWord && any('show', 'open', 'see', 'view', 'my', 'display'))
  return { name: 'show_wishlist', args: {} };

// Add to wishlist - exact phrases
if (any('save this', 'save it', 'wishlist this', 'add to wish', 'love this', 'like this', 'favourite this', 'favorite this'))
  return { name: 'add_to_wishlist', args: {} };

// Add to wishlist - with "the" and variations
if (any('add to the wish list', 'add to wish list', 'add to my wishlist', 'add to my wish list'))
  return { name: 'add_to_wishlist', args: {} };

// Add to wishlist - flexible (any add/save + wish)
if (any('add', 'save') && any('wish', 'wishlist', 'wish list'))
  return { name: 'add_to_wishlist', args: {} };


  // ── PLACE / AR ────────────────────────────────────────────────────────────
  if (any('place this', 'place it', 'put this in my room', 'try in my room',
          'try it in my room', 'show in my room', 'see it in my room',
          'put it in my room', 'add to my room', 'place in room', 'ar view',
          'augmented reality', 'see in space', 'put in space'))
    return { name: 'place_product', args: {} };

  // ── REMOVE / SCENE CLEAR ──────────────────────────────────────────────────
  if (any('remove it', 'delete it', 'clear scene', 'clear all', 'remove all',
          'start over', 'undo placement', 'take it away', 'don t like it',
          'dont like it', 'not what i wanted', 'try something else', 'that s not right',
          'that s wrong', 'remove from room', 'delete from room'))
    return { name: 'remove_placed_product', args: { all: any('all', 'everything', 'clear') } };

  // ── BUDGET ───────────────────────────────────────────────────────────────
  if (any('budget', 'afford', 'can i afford', 'over budget', 'within budget',
          'how much left', 'remaining budget', 'spending', 'price check',
          'match my budget', 'fit my budget', 'does it match', 'fit the budget',
          'am i over', 'check my budget', 'budget check', 'how much is', 'total cost'))
    return { name: 'check_budget', args: {} };

  // ── HOME / BROWSE ─────────────────────────────────────────────────────────
  if (any('go home', 'go back', 'home page', 'homepage', 'main page', 'start page',
          'browse page', 'back to browse', 'back to home', 'show all', 'all products',
          'go to browse', 'back to catalog', 'catalog page', 'product list'))
    return { name: 'go_home', args: {} };

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  if (any('warm light', 'warm lighting', 'cozy light', 'cosy light', 'yellow light', 'orange light', 'sunset'))
    return { name: 'set_lighting', args: { preset: 'warm' } };
  if (any('cool light', 'cool lighting', 'blue light', 'cold light', 'cold lighting'))
    return { name: 'set_lighting', args: { preset: 'cool' } };
  if (any('daylight', 'natural light', 'day light', 'sunlight', 'bright light', 'daytime'))
    return { name: 'set_lighting', args: { preset: 'daylight' } };
  if (any('evening light', 'evening lighting', 'dim light', 'night light', 'night mode', 'dark light', 'moody'))
    return { name: 'set_lighting', args: { preset: 'evening' } };
  if (any('showroom', 'studio light', 'studio lighting', 'display light', 'professional light'))
    return { name: 'set_lighting', args: { preset: 'showroom' } };
  // Generic "change lighting" / "change the light" without a mood → evening as default
  if (any('change light', 'change the light', 'switch light', 'adjust light', 'lighting please'))
    return { name: 'set_lighting', args: { preset: 'daylight' } };

  // ── COMPLETE THE LOOK ─────────────────────────────────────────────────────
  if (any('complete the look', 'complete my look', 'what goes with', 'goes with this',
          'match this', 'coordinate with', 'pair with', 'what matches', 'style this',
          'what else', 'recommend more', 'suggest more', 'goes well with'))
    return { name: 'complete_the_look', args: {} };

  // ── COLLABORATION ─────────────────────────────────────────────────────────
  if (any('collab', 'collaboration', 'call', 'share session', 'invite', 'share screen',
          'start call', 'join call', 'open session', 'multiplayer'))
    return { name: 'open_collab', args: {} };

  // ── QUICK SHOW / NAVIGATE ─────────────────────────────────────────────────
if (any('show my wishlist', 'open wishlist', 'show wishlist', 'my favourites', 'my favorites'))
  return { name: 'show_wishlist', args: {} };

  if (any('show my cart', 'open my cart', 'open the cart', 'show the cart', 'view cart', 'view my cart'))
    return { name: 'show_cart', args: {} };

  
  // ── SEARCH SHORTCUTS (avoid Gemini for obvious catalog searches) ──────────
  // "show me sofas", "find chairs", "search tables" etc.
  const searchTrigger = any('show me', 'find me', 'search for', 'look for', 'find a', 'show a',
                             'browse', 'search', 'i want a', 'i need a', 'i m looking for',
                             'looking for', 'find some', 'show some');
  const furnitureWord = any('sofa', 'couch', 'chair', 'table', 'bed', 'wardrobe', 'shelf',
                             'lamp', 'desk', 'rug', 'cabinet', 'dresser', 'ottoman', 'bookcase',
                             'mirror', 'stool', 'bench', 'armchair', 'sectional', 'futon');
  if (searchTrigger && furnitureWord) {
    // Extract the query — everything after the trigger phrase
    const triggerRx = /\b(show me|find me|search for|look for|find a?|show a?|browse|search|i want a?|i need a?|i(?:'m| am) looking for|looking for|find some|show some)\b/i;
    const query = rawText.replace(triggerRx, '').trim() || rawText.trim();
    return { name: 'search_catalog', args: { query } };
  }

  // Price filter shortcut: "under $X", "below $X", "less than $X"
  const priceMatch = t.match(/(?:under|below|less than|cheaper than|max|maximum)\s*\$?\s*(\d+)/);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1], 10);
    const query    = rawText.replace(/under|below|less than|cheaper than|max|maximum|\$|\d+/gi, '').trim() || 'furniture';
    return { name: 'search_catalog', args: { query, maxPrice } };
  }

  // ── NOT MATCHED — let Gemini handle it ───────────────────────────────────
  return null;
}