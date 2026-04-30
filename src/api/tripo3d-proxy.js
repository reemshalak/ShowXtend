// api/tripo3d-proxy.js
export default async function handler(req, res) {
  const apiKey = process.env.VITE_TRIPO3D_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'Tripo3D API key not configured' });
  }

  const url = `https://api.tripo3d.ai/v2/openapi${req.url.replace('/api/tripo3d-proxy', '')}`;
  
  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    };
    
    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }
    
    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[Tripo3D Proxy] Error:', err);
    res.status(500).json({ error: 'Failed to proxy Tripo3D request' });
  }
}