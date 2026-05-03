/**
 * tripo3d.ts
 *
 * Client-side Tripo3D integration.
 *
 * Routing:
 *   ALL environments (dev + prod) → /api/tripo3d-proxy
 *
 *   On Vercel: handled by api/tripo3d-proxy.js (serverless function)
 *   On localhost: handled by Vite proxy in vite.config.ts:
 *     '/api/tripo3d-proxy' → 'https://api.tripo3d.ai/v2/openapi'
 *     with headers injection for the API key.
 *
 * The old split (isDev → '/api/tripo3d', isProd → '/api/tripo3d-proxy')
 * was broken because:
 *   1. '/api/tripo3d' never existed as a Vite dev server route.
 *   2. The proxy function incorrectly tried to strip its own name from req.url.
 */

export type Tripo3DStatus = 'idle' | 'generating' | 'placing' | 'ready' | 'error';

// Single proxy path used in every environment
const BASE_URL = '/api/tripo3d-proxy';

// API key is only needed for the Vite dev proxy header injection (see vite.config.ts).
// The Vercel function reads it from process.env server-side — never exposed to browser.
const blobUrls = new Set<string>();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function cleanupBlobUrls() {
  blobUrls.forEach(url => URL.revokeObjectURL(url));
  blobUrls.clear();
}

export async function generateTripo3DModel(
  imageUrl: string,
  onStatus: (s: Tripo3DStatus, url?: string) => void,
  options?: { xrMode?: boolean },
): Promise<string> {
  const isXR = options?.xrMode;

  onStatus('generating');

  // ── Step 1: Download product image and upload to Tripo3D ──────────────────
  let imageBlob: Blob;
  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`Image fetch failed: ${imageResponse.status}`);
    imageBlob = await imageResponse.blob();
  } catch (err) {
    throw new Error(`Failed to fetch product image: ${err instanceof Error ? err.message : err}`);
  }

  const uploadFormData = new FormData();
  uploadFormData.append('file', imageBlob, 'product.jpg');

  const uploadRes = await fetch(`${BASE_URL}/upload/sts`, {
    method: 'POST',
    body: uploadFormData,
    // NOTE: do NOT set Content-Type here — browser sets it with the correct
    // multipart boundary automatically when body is FormData.
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`Tripo3D upload failed: ${uploadRes.status} — ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const imageToken = uploadData.data?.image_token ?? uploadData.data?.file_token;

  console.log('[Tripo3D] Upload response:', uploadData);
  console.log('[Tripo3D] imageToken:', imageToken);

  if (!imageToken) {
    throw new Error(`Tripo3D: No image_token in upload response: ${JSON.stringify(uploadData)}`);
  }

  // ── Step 2: Create generation task ───────────────────────────────────────
  const createRes = await fetch(`${BASE_URL}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'image_to_model',
      model_version: 'v2.5-20250123',
      file: { type: 'jpg', file_token: imageToken },
      texture: true,
      smart_low_poly: true,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '');
    throw new Error(`Tripo3D create task failed: ${createRes.status} — ${errText}`);
  }

  const createData = await createRes.json();
  const taskId = createData.data?.task_id;

  if (!taskId) {
    throw new Error(`Tripo3D: No task_id in response: ${JSON.stringify(createData)}`);
  }

  console.log(`[Tripo3D] Task created: ${taskId}`);

  // ── Step 3: Poll for completion ───────────────────────────────────────────
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    onStatus('generating');

    const statusRes = await fetch(`${BASE_URL}/task/${taskId}`);

    if (!statusRes.ok) {
      console.warn(`[Tripo3D] Poll ${i + 1}: HTTP ${statusRes.status}, retrying…`);
      continue;
    }

    const statusData = await statusRes.json();
    const taskStatus = statusData.data?.status;
    const output = statusData.data?.output;

    console.log(`[Tripo3D] Poll ${i + 1}: status=${taskStatus}`);

    if (taskStatus === 'failed') {
      throw new Error(`Tripo3D task failed: ${JSON.stringify(statusData.data?.error ?? '')}`);
    }

    if (taskStatus === 'success') {
      const remoteUrl = output?.pbr_model ?? output?.model ?? output?.base_model;
      if (!remoteUrl) throw new Error('Tripo3D: task succeeded but no model URL in output');

      // XR mode: return CDN URL directly — XRModelWindow receives it via query params
      if (isXR) {
        console.log('[Tripo3D] XR mode — returning remote CDN URL');
        onStatus('ready', remoteUrl);
        return remoteUrl;
      }

      // Web mode: convert to blob URL for same-window <model-viewer>
      console.log('[Tripo3D] Web mode — downloading model as blob…');
      try {
        const downloadRes = await fetch(remoteUrl);
        if (!downloadRes.ok) throw new Error(`Model download failed: ${downloadRes.status}`);
        const modelBlob = await downloadRes.blob();
        const blobUrl = URL.createObjectURL(modelBlob);
        blobUrls.add(blobUrl);
        console.log('[Tripo3D] ✅ Blob URL ready');
        onStatus('ready', blobUrl);
        return blobUrl;
      } catch (downloadErr) {
        console.warn('[Tripo3D] Blob download failed, using remote URL directly:', downloadErr);
        onStatus('ready', remoteUrl);
        return remoteUrl;
      }
    }
  }

  throw new Error('Tripo3D: timed out waiting for model generation');
}

export function getOriginalImageUrl(url: string): string {
  const proxyMatch = url.match(/\/api\/img-proxy\?url=(.+)$/);
  if (proxyMatch) {
    return decodeURIComponent(proxyMatch[1]);
  }
  return url;
}