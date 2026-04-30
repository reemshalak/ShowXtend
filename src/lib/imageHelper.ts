// lib/imageHelper.ts

/**
 * Converts image URL(s) to use local proxy (bypasses CORS)
 * - Pass a string → returns a string
 * - Pass an array → returns an array
 */
export function getImageUrl(url: string | undefined | null): string;
export function getImageUrl(urls: string[] | undefined | null): string[];
export function getImageUrl(url: any): any {
  if (!url) return Array.isArray(url) ? [] : '';
  
  // Handle array
  if (Array.isArray(url)) {
    return url.map(u => getImageUrl(u));
  }
  
  // Handle single string
  if (typeof url === 'string') {
    if (url.startsWith('/')) return url;
    if (url.includes('ikea.com') || url.startsWith('http')) {
      return `/img-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }
  
  return '';
}