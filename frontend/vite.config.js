import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: 'web',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'web/index.html'),
        dashboard: resolve(__dirname, 'web/dashboard.html'),
        market: resolve(__dirname, 'web/market.html'),
        soil: resolve(__dirname, 'web/soil.html'),
        'ai-search': resolve(__dirname, 'web/ai-search.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    // Same-origin API in dev: Vite proxies /api/* to the local Worker so the
    // client can keep using relative URLs exactly as it does in production.
    // Override with VITE_API_PROXY_TARGET to point at a remote Worker.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'web/assets/*', dest: 'assets' },
        { src: 'web/assets/fonts/*', dest: 'assets/fonts' },
        { src: 'web/bangladesh-map.png', dest: '.' },
        { src: 'web/bd_districts.js', dest: '.' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'web/scripts'),
      '@components': resolve(__dirname, 'web/scripts/components'),
      '@utils': resolve(__dirname, 'web/scripts/utils'),
      '@pages': resolve(__dirname, 'web/scripts/pages'),
      '@styles': resolve(__dirname, 'web/styles'),
    },
  },
  css: {
    devSourcemap: true,
  },
});