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
        // Resolved against `root` (`mobile`); see the note in vite.config.js.
        // Each stripBase matches its own glob depth -- see the explanation there.
        { src: 'assets/*', dest: 'assets', rename: { stripBase: 1 } },
        { src: 'assets/fonts/*', dest: 'assets/fonts', rename: { stripBase: 2 } },
        { src: 'assets/images/*', dest: 'assets/images', rename: { stripBase: 2 } },
        { src: 'bd_districts.js', dest: '.' },
        // Directory copies need the same treatment: without stripBase the whole
        // `scripts/` folder lands at `dist/mobile/scripts/scripts/`.
        { src: 'scripts', dest: 'scripts', rename: { stripBase: 1 } },
        { src: 'mobile.css', dest: '.' },
        { src: '*.html', dest: '.' },
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