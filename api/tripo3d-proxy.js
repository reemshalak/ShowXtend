// api/tripo3d-proxy.js
//
// Vercel serverless function — proxies all Tripo3D API calls.
//
// How Vercel routing works:
//   A request to /api/tripo3d-proxy/task  → req.url = "/task"
//   A request to /api/tripo3d-proxy/upload/sts → req.url = "/upload/sts"
//
// The function name segment (/api/tripo3d-proxy) is ALREADY stripped by
// Vercel before req.url reaches this handler — so we must NOT try to
// remove it again with .replace().

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.VITE_TRIPO3D_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Tripo3D API key not configured on server' });
  }

  // req.url is already the path AFTER /api/tripo3d-proxy, e.g. "/task" or "/upload/sts"
  // Make sure it starts with /
  const subPath = req.url.startsWith('/') ? req.url : `/${req.url}`;
  const targetUrl = `https://api.tripo3d.ai/v2/openapi${subPath}`;

  console.log(`[tripo3d-proxy] ${req.method} ${subPath} → ${targetUrl}`);

  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    let body = undefined;

    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] ?? '';

      if (contentType.includes('multipart/form-data')) {
        // File upload — forward raw body with original content-type
        // Vercel gives us the raw buffer in req.body when bodyParser is disabled
        headers['Content-Type'] = contentType;
        body = req.body;
      } else {
        // JSON body
        headers['Content-Type'] = 'application/json';
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseText = await response.text();

    // Try to parse as JSON, fall back to raw text
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    res.status(response.status).json(data);
  } catch (err) {
    console.error('[tripo3d-proxy] Error:', err);
    res.status(500).json({ error: 'Failed to proxy Tripo3D request', detail: err.message });
  }
}

// Disable Vercel's automatic body parsing so we can forward raw multipart
export const config = {
  api: {
    bodyParser: false,
  },
};