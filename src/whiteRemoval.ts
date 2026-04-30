/**
 * whiteRemoval.ts
 *
 * Singleton WebGL processor — ONE canvas, ONE context, shared across the
 * entire app. Every call to removeWhiteBackground() reuses the same GL
 * context; it just re-uploads the texture and re-renders.
 *
 * The fragment shader does a luminance + saturation chroma-key:
 *   • Near-white pixels (high luminance, low saturation) → alpha = 0
 *   • Soft threshold so edges feather naturally (no hard cutout jaggies)
 *   • Fringe colour correction: desaturates semi-transparent edge pixels
 *     so they don't leave a milky halo
 *
 * No CSS blend modes. No canvas 2D. Pure GLSL.
 *
 * Usage (imperative):
 *   import { removeWhiteBackground } from './whiteRemoval';
 *   const dataUrl = await removeWhiteBackground(imageUrl);
 *
 * Usage (React hook):
 *   import { useWhiteRemoval } from './whiteRemoval';
 *   const src = useWhiteRemoval(rawUrl);   // returns processed data-url or null
 */

// ─── Shader sources ───────────────────────────────────────────────────────────

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main(){
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Tunable knobs (tweak if needed for a specific image source)
const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;

// --- tunables ---
// Luminance above which a pixel is "white-ish"
const float LUM_THRESHOLD  = 0.82;
// Width of the soft feather zone (0 = hard cut, 0.18 = very soft)
const float FEATHER        = 0.18;
// Max saturation still considered "background" (pure white has sat=0)
const float SAT_MAX        = 0.18;
// How aggressively to defringe semi-transparent edge pixels
const float DEFRINGE       = 0.85;

void main(){
  vec4 c = texture2D(u_tex, v_uv);

  // Luminance (perceptual weights)
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));

  // Saturation: distance from grey axis
  float cmax = max(max(c.r, c.g), c.b);
  float cmin = min(min(c.r, c.g), c.b);
  float sat  = (cmax < 0.001) ? 0.0 : (cmax - cmin) / cmax;

  // How "white" is this pixel? 1 = definitely white, 0 = definitely not
  float whiteness = smoothstep(LUM_THRESHOLD - FEATHER, LUM_THRESHOLD, lum)
                  * smoothstep(SAT_MAX, 0.0, sat);

  // Alpha: 1 for foreground pixels, 0 for background
  float alpha = 1.0 - whiteness;

  // Defringe: pull semi-transparent edge pixels away from white
  // by darkening them slightly proportional to their transparency
  vec3 defringed = c.rgb * (1.0 - (1.0 - alpha) * DEFRINGE);

  gl_FragColor = vec4(defringed, alpha * c.a);
}`;

// ─── Singleton GL state ───────────────────────────────────────────────────────

let gl:       WebGLRenderingContext | null = null;
let program:  WebGLProgram          | null = null;
let canvas:   HTMLCanvasElement     | null = null;
let texLoc:   WebGLUniformLocation  | null = null;
let glReady = false;

function initGL() {
  if (glReady) return true;

  canvas = document.createElement('canvas');
  // Off-screen — never attached to DOM
  const ctx = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!ctx) { console.warn('[whiteRemoval] WebGL not available'); return false; }
  gl = ctx;

  // Compile shaders
  const compile = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS))
      throw new Error('[whiteRemoval] shader: ' + gl!.getShaderInfoLog(s));
    return s;
  };

  const vert = compile(gl.VERTEX_SHADER,   VERT);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG);

  program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error('[whiteRemoval] link: ' + gl.getProgramInfoLog(program));

  gl.useProgram(program);

  // Full-screen quad (two triangles)
  const verts = new Float32Array([
    -1,-1, 0,1,   1,-1, 1,1,   -1,1, 0,0,
    -1, 1, 0,0,   1,-1, 1,1,    1,1, 1,0,
  ]);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  const posLoc = gl.getAttribLocation(program, 'a_pos');
  const uvLoc  = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc,  2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  texLoc = gl.getUniformLocation(program, 'u_tex');
  gl.uniform1i(texLoc, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  glReady = true;
  return true;
}

// ─── In-flight request deduplication ─────────────────────────────────────────

// If two components request the same URL simultaneously, we resolve both from
// the same single fetch+process — no duplicate work.
const inFlight = new Map<string, Promise<string>>();
const cache    = new Map<string, string>(); // url → processed data-url

// ─── Core processor ───────────────────────────────────────────────────────────

export async function removeWhiteBackground(url: string): Promise<string> {
  if (cache.has(url)) return cache.get(url)!;
  if (inFlight.has(url)) return inFlight.get(url)!;

  const promise = (async (): Promise<string> => {
    // 1. Load image (respect CORS)
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload  = () => res(i);
      i.onerror = () => {
        // CORS failed — return original URL unchanged rather than crashing
        rej(new Error('load-failed'));
      };
      i.src = url;
    }).catch(() => null);

    if (!img) return url; // fallback: show original

    // 2. Init GL (once)
    if (!initGL() || !gl || !canvas) return url;

    // 3. Resize canvas to image dimensions
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    gl.viewport(0, 0, img.naturalWidth, img.naturalHeight);

    // 4. Upload texture
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // 5. Render
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();

    // 6. Read back as PNG
    const result = canvas.toDataURL('image/png');

    // 7. Cleanup texture (reuse context for next image)
    gl.deleteTexture(tex);

    cache.set(url, result);
    return result;
  })();

  inFlight.set(url, promise);
  promise.finally(() => inFlight.delete(url));
  return promise;
}

// ─── React hook ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

/**
 * useWhiteRemoval(url)
 *
 * Returns:
 *   null     → still processing (show skeleton / spinner)
 *   string   → processed PNG data-url (or original url on CORS failure)
 *
 * The hook is safe to call for many images simultaneously — they all
 * share the ONE WebGL context and are processed sequentially.
 */
export function useWhiteRemoval(url: string | null | undefined): string | null {
  const [result, setResult] = useState<string | null>(() => {
    // Synchronous cache hit — no flicker on re-render
    if (url && cache.has(url)) return cache.get(url)!;
    return null;
  });

  useEffect(() => {
    if (!url) { setResult(null); return; }
    // Check cache again in case it was filled between render and effect
    if (cache.has(url)) { setResult(cache.get(url)!); return; }

    let cancelled = false;
    removeWhiteBackground(url).then(r => { if (!cancelled) setResult(r); });
    return () => { cancelled = true; };
  }, [url]);

  return result;
}
