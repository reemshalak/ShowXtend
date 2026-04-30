export type Tripo3DStatus = 'idle' | 'generating' | 'placing' | 'ready' | 'error';

const API_KEY = (import.meta as any).env?.VITE_TRIPO3D_API_KEY ?? '';
const BASE_URL = '/api/tripo3d';

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
  options?: { xrMode?: boolean }
): Promise<string> {
  const isXR = options?.xrMode;

  if (!API_KEY) {
    console.warn('[Tripo3D] No API key — using fallback');
    onStatus('generating');
    await sleep(2000);
    const fallback = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';
    onStatus('ready', fallback);
    return fallback;
  }

  onStatus('generating');

  // Step 1: Upload image
  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();

  const uploadFormData = new FormData();
  uploadFormData.append('file', imageBlob, 'product.jpg');

  const uploadRes = await fetch(`${BASE_URL}/upload/sts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: uploadFormData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Tripo3D upload failed: ${uploadRes.status} - ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const imageToken = uploadData.data?.image_token ?? uploadData.data?.file_token;
console.log('[Tripo3D] Upload response:', uploadData);
console.log('[Tripo3D] imageToken:', imageToken);

  if (!imageToken) {
    throw new Error(`Tripo3D: No image_token. Response: ${JSON.stringify(uploadData)}`);
  }

  // Step 2: Create task
  const createRes = await fetch(`${BASE_URL}/task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      type: 'image_to_model',
      model_version: 'v2.5-20250123',
      file: { type: 'jpg', file_token: imageToken },
      texture: true,
      smart_low_poly:true,
      
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Tripo3D create task failed: ${createRes.status} - ${errText}`);
  }

  const createData = await createRes.json();
  const taskId = createData.data?.task_id;

  if (!taskId) {
    throw new Error(`Tripo3D: No task_id. Response: ${JSON.stringify(createData)}`);
  }

  console.log(`[Tripo3D] Task created: ${taskId}`);

  // Step 3: Poll for completion
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    onStatus('generating');

    const statusRes = await fetch(`${BASE_URL}/task/${taskId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });

    if (!statusRes.ok) {
      console.warn(`[Tripo3D] Poll ${i + 1}: HTTP ${statusRes.status}, retrying...`);
      continue;
    }

    const statusData = await statusRes.json();
    const taskStatus = statusData.data?.status;
    const output = statusData.data?.output;

    console.log(`[Tripo3D] Poll ${i + 1}: status=${taskStatus}`);

    if (taskStatus === 'failed') {
      throw new Error(`Tripo3D: task failed. ${JSON.stringify(statusData.data?.error ?? '')}`);
    }

    if (taskStatus === 'success') {
      const remoteUrl = output?.pbr_model ?? output?.model ?? output?.base_model;
      if (!remoteUrl) throw new Error('Tripo3D: success but no model URL in output');

      // XR mode: return CDN URL directly
      // XRModelWindow opens with this URL already in its query params — no blob needed
      if (isXR) {
        console.log('[Tripo3D] XR mode — returning remote CDN URL');
        onStatus('ready', remoteUrl);
        return remoteUrl;
      }

      // Web mode: convert to blob (same window, no scope issue)
      console.log('[Tripo3D] Web mode — downloading and converting to blob...');
      try {
        const downloadResponse = await fetch(remoteUrl);
        if (!downloadResponse.ok) throw new Error(`Download failed: ${downloadResponse.status}`);
        const modelBlob = await downloadResponse.blob();
        const blobUrl = URL.createObjectURL(modelBlob);
        blobUrls.add(blobUrl);
        console.log('[Tripo3D] ✅ Blob URL ready');
        onStatus('ready', blobUrl);
        return blobUrl;
      } catch (downloadError) {
        console.warn('[Tripo3D] Blob download failed, falling back to remote URL:', downloadError);
        onStatus('ready', remoteUrl);
        return remoteUrl;
      }
    }
  }

  throw new Error('Tripo3D: timeout waiting for model');
}

export function getOriginalImageUrl(url: string): string {
  // Check if it's a proxied URL
  const proxyMatch = url.match(/\/img-proxy\?url=(.+)$/);
  if (proxyMatch) {
    return decodeURIComponent(proxyMatch[1]);
  }
  return url;
}