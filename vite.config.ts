/**
 * vite.config.ts
 *
 * Dev proxy setup — makes localhost behave identically to Vercel:
 *
 *   /api/img-proxy?url=...     → fetches image URL server-side (no CORS)
 *   /api/tripo3d-proxy/...     → proxies to api.tripo3d.ai with API key injected
 *
 * On Vercel these are handled by the serverless functions in /api/*.js.
 * On localhost Vite's dev server handles them via the proxy config below.
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load .env so we can read VITE_* keys inside vite.config
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    server: {
      proxy: {
        // ── Image proxy ──────────────────────────────────────────────
        // Vite rewrites  /api/img-proxy?url=<encoded>
        // to             https://<decoded-host>/<path>
        // by using a custom router function.
        '/api/img-proxy': {
          target: 'https://www.ikea.com', // default target (overridden by router)
          changeOrigin: true,
          secure: false,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Extract the ?url= param and rewrite the request to that URL
              const rawUrl = new URL(req.url ?? '', 'http://localhost').searchParams.get('url');
              if (rawUrl) {
                const target = new URL(rawUrl);
                proxyReq.host = target.host;
                proxyReq.path = target.pathname + target.search;
                proxyReq.setHeader('host', target.host);
                proxyReq.setHeader('referer', 'https://www.ikea.com/');
                proxyReq.setHeader(
                  'user-agent',
                  'Mozilla/5.0 (compatible; image-proxy/1.0)',
                );
              }
            });
          },
        },

        // ── Tripo3D proxy ────────────────────────────────────────────
        // Vite rewrites  /api/tripo3d-proxy/<path>
        // to             https://api.tripo3d.ai/v2/openapi/<path>
        // and injects the Authorization header server-side so the API
        // key is never sent to the browser.
        '/api/tripo3d-proxy': {
          target: 'https://api.tripo3d.ai',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/tripo3d-proxy/, '/v2/openapi'),
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.VITE_TRIPO3D_API_KEY;
              if (key) {
                proxyReq.setHeader('Authorization', `Bearer ${key}`);
              }
            });
          },
        },
      },
    },
  };
});