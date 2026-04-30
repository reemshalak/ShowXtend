/**
 * ikeaApi.ts — ikea-api-pro (RapidAPI)
 */

import { PRODUCTS, type Product } from './data';

const RAPIDAPI_KEY = (import.meta as any).env?.VITE_RAPIDAPI_KEY ?? '';
const HOST         = 'ikea-api-pro.p.rapidapi.com';
const BASE         = 'https://ikea-api-pro.p.rapidapi.com';
const COUNTRY      = 'us';
const LANGUAGE     = 'en';

// ── Image proxy ──────────────────────────────────────────────────────────────
function getProxiedImageUrl(url: string): string {
  if (!url) return '';
  
  // DIRECT IKEA URL - try this first
  return url;
}

// ── Single in-memory store ──────────────────────────────────────────────────
let _allProducts: Product[] | null = null;
let _loadPromise: Promise<Product[]> | null = null;

// ── Product detail types (for review page + enriched CenterPanel) ───────────
export interface ProductReview {
  name:        string;
  ratingValue: number;
  title:       string;
  text:        string;
  countryName: string;
}

export interface ProductDetail {
  ikeaId:       string;
  productName:  string;
  description:  string;
  designerName: string;
  measurement:  string;
  productPrice: number;
  rating: {
    average:     number;
    reviewCount: number;
    reviewInfo:  string;
  };
  reviews:      ProductReview[];
  gallery:      string[];           // image URLs
  variants:     { id: string; title: string; imageUrl: string; price: number; url: string }[];
  packaging: {
    weightText:  string;
    widthText:   string;
    lengthText:  string;
    heightText:  string;
  };
}

// ── Detail cache — keyed by ikeaId, populated lazily on product open ─────────
const _detailCache = new Map<string, ProductDetail>();
const _detailInflight = new Map<string, Promise<ProductDetail | null>>();

// ── Single keyword to get products (avoid rate limits) ──────────────────────
const SEARCH_KEYWORD = 'furniture';  // One broad search instead of many

// ── Category matchers (client-side) ─────────────────────────────────────────
const CATEGORY_MATCHERS: Record<string, (t: string) => boolean> = {
  'Living Room': t => /sofa|couch|armchair|coffee table|tv unit|rug|lounge|ottoman/.test(t),
  'Bedroom':     t => /bed|wardrobe|nightstand|dresser|pillow|duvet|mattress|frame/.test(t),
  'Workspace':   t => /desk|office|monitor|drawer unit|file|chair|ergonomic/.test(t),
  'Kitchen':     t => /kitchen|cabinet|storage|trolley|island|pantry/.test(t),
  'Bathroom':    t => /bath|mirror|towel|toilet|shower|vanity/.test(t),
  'Dining':      t => /dining|table|bar stool|bench|sideboard|buffet/.test(t),
};

function pickEmoji(typeName = ''): string {
  const t = typeName.toLowerCase();
  if (t.includes('sofa') || t.includes('couch')) return '🛋️';
  if (t.includes('armchair')) return '🪑';
  if (t.includes('chair')) return '💺';
  if (t.includes('table')) return '🪵';
  if (t.includes('bed')) return '🛏️';
  if (t.includes('lamp') || t.includes('light')) return '💡';
  if (t.includes('desk')) return '🖥️';
  if (t.includes('wardrobe') || t.includes('storage')) return '🚪';
  if (t.includes('shelf') || t.includes('bookcase')) return '📚';
  if (t.includes('rug') || t.includes('carpet')) return '🪣';
  if (t.includes('mirror')) return '🪞';
  if (t.includes('dining')) return '🍽️';
  if (t.includes('kitchen')) return '🍳';
  return '🪑';
}

function pickCategory(typeName = ''): string {
  const t = typeName.toLowerCase();
  for (const [cat, match] of Object.entries(CATEGORY_MATCHERS)) {
    if (match(t)) return cat;
  }
  return 'Living Room';
}

function mapProduct(raw: any): Product {
  let priceNum = 0;
  let priceStr = 'POA';
  
  // 1. UPDATED PRICE LOGIC (Matching your new schema)
  const currentPrice = raw.price?.currentPrice || raw.price?.amount || (typeof raw.price === 'number' ? raw.price : 0);
  const formattedPrice = raw.price?.formattedPrice;

  if (currentPrice) {
    priceNum = currentPrice;
    priceStr = formattedPrice || `$${priceNum}`;
  }

  // 2. UPDATED RATING LOGIC (Matching raw.rating.average)
  const rating = raw.rating?.average ?? raw.rating?.averageRating ?? 4.0;
  const reviews = raw.rating?.count ?? raw.rating?.numberOfRatings ?? 50;
  
  const typeName = raw.typeName ?? raw.category ?? raw.type ?? 'Furniture';
  const name = raw.name ?? raw.productName ?? 'IKEA Product';
  
  // 3. THE CRITICAL IMAGE FIX
  // Your schema: images -> all -> [0] -> url
  const rawImageUrl = raw.images?.all?.[0]?.url ?? 
                      raw.images?.[0]?.url ?? 
                      raw.imageUrl ?? 
                      raw.mainImageUrl ?? '';
                      
  const imageUrl = getProxiedImageUrl(rawImageUrl);
  const emoji = pickEmoji(typeName);

  const rawId = String(raw.id ?? raw.productId ?? raw.itemCode ?? Date.now());
  const numId = parseInt(rawId.replace(/\D/g, '').slice(0, 9) || '9999', 10);
  const description = raw.details?.designText ?? raw.description ?? `A beautiful ${name} from IKEA`;

  return {
    id: numId,
    name,
    type: typeName,
    fullType: [typeName, description.slice(0, 50)].filter(Boolean).join(' · '),
    description,
    emoji,
    price: priceStr,
    priceNum,
    rating,
    designer: raw.details?.designText ?? 'IKEA',
    articleNumber: String(raw.id ?? ''),
    imageUrl, // Now points to the correct nested URL
    thumbEmojis: [emoji, '🔘', '📐', '🖼️'],
    dims: {
      w: raw.width ?? 80,
      h: raw.height ?? 75,
      d: raw.depth ?? 60,
    },
    category: pickCategory(typeName),
    onSale: !!raw.badge?.includes('Sale'),
    isNew: !!raw.badge?.includes('New'),
    salePercent: 0,
    originalPrice: priceNum,
    reviewCount: reviews,
    colors: [],
    materials: [],
    ikeaId: String(raw.id ?? ''),
    ikeaUrl: raw.url ?? `https://www.ikea.com/us/en/search/products/?q=${encodeURIComponent(name)}`,
  } as Product;
}

async function apiFetch(path: string): Promise<any> {
  if (!RAPIDAPI_KEY) {
    throw new Error('No API key. Add VITE_RAPIDAPI_KEY to .env');
  }
  
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': HOST,
      'Content-Type': 'application/json',
    },
  });
  
  if (!res.ok) {
    throw new Error(`IKEA API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// ── Load products from API ──────────────────────────────────────────────────
async function loadAllProducts(): Promise<Product[]> {
  console.log('[ikeaApi] Loading products from IKEA API...');
  
  try {
    // Single keyword search
    const response = await apiFetch(
      `/product-search-by-keyword` +
      `?keyword=${SEARCH_KEYWORD}` +
      `&languageCode=${LANGUAGE}` +
      `&countryCode=${COUNTRY}` +
      `&page=1` +
      `&sortOrder=RELEVANCE`
    );
    
    console.log('[ikeaApi] API Response:', response);
    
    // Extract products from response
    let productsArray: any[] = [];
    
    if (response?.data?.products && Array.isArray(response.data.products)) {
      productsArray = response.data.products;
    } else if (response?.products && Array.isArray(response.products)) {
      productsArray = response.products;
    } else if (response?.results && Array.isArray(response.results)) {
      productsArray = response.results;
    } else if (Array.isArray(response)) {
      productsArray = response;
    } else if (response?.data && Array.isArray(response.data)) {
      productsArray = response.data;
    }
    
    console.log(`[ikeaApi] Found ${productsArray.length} products`);
    
    if (productsArray.length === 0) {
      console.warn('[ikeaApi] No products found, using local fallback');
      return PRODUCTS as Product[];
    }
    
    const products = productsArray.map(mapProduct);
    console.log(`[ikeaApi] Mapped ${products.length} products`);
    
    return products;
    
  } catch (err) {
    console.error('[ikeaApi] API error:', err);
    console.warn('[ikeaApi] Falling back to local data');
    return PRODUCTS as Product[];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function getAllProducts(): Promise<Product[]> {
  if (_allProducts) return _allProducts;
  if (_loadPromise) return _loadPromise;

  _loadPromise = loadAllProducts().then(p => {
    _allProducts = p;
    return p;
  });

  return _loadPromise;
}

export async function browseCategory(category: string, limit = 48): Promise<Product[]> {
  const all = await getAllProducts();
  if (category === 'All') return all.slice(0, limit);

  const matcher = CATEGORY_MATCHERS[category];
  if (!matcher) return all.slice(0, limit);

  const filtered = all.filter(p => matcher((p.type ?? '').toLowerCase()));
  return filtered.length ? filtered.slice(0, limit) : all.slice(0, limit);
}

export async function searchProducts(query: string, limit = 48): Promise<Product[]> {
  const all = await getAllProducts();
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return all.slice(0, limit);

  const filtered = all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.type ?? '').toLowerCase().includes(q) ||
    (p.fullType ?? '').toLowerCase().includes(q)
  );
  return filtered.length ? filtered.slice(0, limit) : all.slice(0, limit);
}


/**
 * AI-specific product search - hits the live IKEA API directly
 * Used by the assistant for natural language queries like "house plants"
 */

const aiSearchCache = new Map<string, { products: Product[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function aiSearchProducts(query: string, limit = 3): Promise<Product[]> {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  
  // 🔥 Check cache first
  const cached = aiSearchCache.get(q);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[ikeaApi] Cache hit for "${q}"`);
    return cached.products.slice(0, limit);
  }
  
  console.log(`[ikeaApi] AI search for: "${q}"`);
  
  try {
    // Try live IKEA API search first
    const response = await apiFetch(
      `/product-search-by-keyword?keyword=${encodeURIComponent(q)}&languageCode=${LANGUAGE}&countryCode=${COUNTRY}&page=1&sortOrder=RELEVANCE&limit=${limit}`
    );
    
    let productsArray: any[] = [];
    if (response?.data?.products && Array.isArray(response.data.products)) {
      productsArray = response.data.products;
    } else if (response?.products && Array.isArray(response.products)) {
      productsArray = response.products;
    } else if (response?.results && Array.isArray(response.results)) {
      productsArray = response.results;
    }
    
    if (productsArray.length > 0) {
      console.log(`[ikeaApi] AI search found ${productsArray.length} products for "${q}"`);
      return productsArray.map(mapProduct).slice(0, limit);
    }
  } catch (err) {
    console.warn(`[ikeaApi] AI search failed for "${q}":`, err);
  }
  
  // Fallback to local cache if API fails
  console.log(`[ikeaApi] AI search falling back to local cache for "${q}"`);
  const all = await getAllProducts();
  const filtered = all.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.type ?? '').toLowerCase().includes(q) ||
    (p.fullType ?? '').toLowerCase().includes(q)
  );
  return filtered.slice(0, limit);
}


// ── Map /product-details response → ProductDetail ───────────────────────────
function mapProductDetail(raw: any): ProductDetail {
  const info     = raw.productInfo ?? {};
  const ratingRaw = raw.rating ?? {};
  const gallery  = (raw.gallery ?? [])
    .map((g: any) => g.url ?? '')
    .filter(Boolean) as string[];
  const variants = (raw.variants ?? []).map((v: any) => ({
    id:       String(v.productID ?? v.id ?? ''),
    title:    v.title ?? v.designText ?? '',
    imageUrl: v.imageUrl ?? '',
    price:    v.price?.currentPrice ?? 0,
    url:      v.url ?? '',
  }));

  return {
    ikeaId:       String(info.productID ?? ''),
    productName:  info.productName ?? '',
    description:  info.description ?? '',
    designerName: info.designerName ?? 'IKEA',
    measurement:  info.measurement ?? '',
    productPrice: info.productPrice ?? 0,
    rating: {
      average:     ratingRaw.average ?? 0,
      reviewCount: ratingRaw.reviewCount ?? 0,
      reviewInfo:  ratingRaw.reviewInfo ?? '',
    },
    reviews: (raw.highlightedReviews ?? []).map((r: any) => ({
      name:        r.name ?? '',
      ratingValue: r.ratingValue ?? 5,
      title:       r.title ?? '',
      text:        r.text ?? '',
      countryName: r.countryName ?? '',
    })),
    gallery,
    variants,
    packaging: {
      weightText: raw.packaging?.weightText ?? '',
      widthText:  raw.packaging?.widthText  ?? '',
      lengthText: raw.packaging?.lengthText ?? '',
      heightText: raw.packaging?.heightText ?? '',
    },
  };
}

/**
 * Fetch full product details — cached per ikeaId, deduped in-flight.
 * Call this when a product panel opens. Subsequent opens are free.
 */
export async function getProductDetails(ikeaId: string): Promise<ProductDetail | null> {
  if (!ikeaId) return null;
  if (_detailCache.has(ikeaId)) return _detailCache.get(ikeaId)!;
  if (_detailInflight.has(ikeaId)) return _detailInflight.get(ikeaId)!;

  const promise = apiFetch(
    `/product-details?productId=${ikeaId}&languageCode=${LANGUAGE}&countryCode=${COUNTRY}`
  )
    .then(response => {
      const data = response?.data ?? response;
      if (!data) return null;
      const detail = mapProductDetail(data);
      _detailCache.set(ikeaId, detail);
      return detail;
    })
    .catch(err => {
      console.warn('[ikeaApi] getProductDetails failed:', err);
      return null;
    })
    .finally(() => {
      _detailInflight.delete(ikeaId);
    });

  _detailInflight.set(ikeaId, promise);
  return promise;
}

/**
 * Get reviews for a product — returns from detail cache if already fetched,
 * otherwise triggers a detail fetch. Use this on your review page.
 */
export async function getProductReviews(ikeaId: string): Promise<ProductReview[]> {
  const detail = await getProductDetails(ikeaId);
  return detail?.reviews ?? [];
}

export function clearCache() {
  _allProducts = null;
  _loadPromise  = null;
  _detailCache.clear();
  _detailInflight.clear();
}

export const hasApiKey = () => Boolean(RAPIDAPI_KEY);