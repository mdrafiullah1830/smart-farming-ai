import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  root: 'mobile',
  publicDir: '../public',
  build: {
    outDir: '../dist/mobile',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'mobile/index.html'),
        dashboard: resolve(__dirname, 'mobile/dashboard.html'),
        market: resolve(__dirname, 'mobile/market.html'),
        soil: resolve(__dirname, 'mobile/soil.html'),
        'ai-search': resolve(__dirname, 'mobile/ai-search.html'),
      },
    },
  },
  server: {
    port: 3001,
    open: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'mobile/assets/*', dest: 'assets' },
        { src: 'mobile/assets/fonts/*', dest: 'assets/fonts' },
        { src: 'mobile/bd_districts.js', dest: '.' },
        { src: 'mobile/scripts', dest: 'scripts' },
        { src: 'mobile/mobile.css', dest: '.' },
        { src: 'mobile/*.html', dest: '.' },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@mobile': resolve(__dirname, 'mobile/scripts'),
    },
  },
  css: {
    devSourcemap: true,
  },
});