import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // es2022 + modern browser targets unlock top-level await support
    target: ['es2022', 'chrome89', 'edge89', 'safari15', 'firefox89'],
  },

  server: {
    proxy: {
      '/img-proxy': {
        target: 'https://www.ikea.com',
        changeOrigin: true,
        secure: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const raw = req.url ?? '';
            const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
            const params = new URLSearchParams(qs);
            const imageUrl = params.get('url');
            if (!imageUrl) return;

            try {
              const parsed = new URL(imageUrl);
              proxyReq.setHeader('host', parsed.host);
              proxyReq.path = parsed.pathname + parsed.search;
              proxyReq.removeHeader('origin');
              proxyReq.removeHeader('referer');
              proxyReq.setHeader('user-agent', 'Mozilla/5.0 (compatible; image-proxy/1.0)');
              (proxy as any).options.target = `${parsed.protocol}//${parsed.host}`;
            } catch {}
          });

          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = 'GET';
            proxyRes.headers['cross-origin-resource-policy'] = 'cross-origin';
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['x-frame-options'];
          });
        },
      },

      '/api/tripo3d': {
        target: 'https://api.tripo3d.ai/v2/openapi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tripo3d/, ''),
      },
    },
  },
});