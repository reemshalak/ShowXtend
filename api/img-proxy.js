// api/img-proxy.js
//
// Vercel serverless function — proxies IKEA CDN images to avoid CORS.
// Works for both Vercel prod and local dev (via vite.config.ts proxy).

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Basic sanity check — only allow http/https URLs
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; image-proxy/1.0)',
        'Referer': 'https://www.ikea.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache

    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[img-proxy] Error fetching:', url, err.message);
    res.status(500).json({ error: 'Failed to fetch image', detail: err.message });
  }
}