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
'/api/img-proxy': {
    target: 'http://localhost:5173',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/img-proxy/, '/img-proxy'),
  },

      '/api/tripo3d': {
        target: 'https://api.tripo3d.ai/v2/openapi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tripo3d/, ''),
      },
    },
  },
});