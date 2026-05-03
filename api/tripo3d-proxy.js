
//
// How Vercel routing works (plain serverless functions, NOT Next.js):
//
// A request to:
//   /api/tripo3d-proxy/upload/sts
//
// arrives as:
//   req.url = "/api/tripo3d-proxy/upload/sts"
//
// So we MUST manually strip the "/api/tripo3d-proxy" prefix:
//
//   → "/upload/sts"
//   → https://api.tripo3d.ai/v2/openapi/upload/sts
//

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


const subPath = req.url.replace(/^\/api\/tripo3d-proxy/, '') || '/';
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
  headers['Content-Type'] = contentType;

  // ✅ Vercel-safe approach: forward buffer instead of req
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  body = Buffer.concat(chunks);
} else {
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