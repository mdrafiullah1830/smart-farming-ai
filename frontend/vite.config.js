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
        // `src` is resolved against `root`, which is `web` (see the `root` field
        // above) -- not against the config file's own directory. Under vite 5 a
        // leading `web/` also happened to match; vite 8 resolves strictly, so
        // these paths are root-relative.
        //
        // `stripBase` removes the leading directory segment the glob match still
        // carries. v1 dropped it implicitly, which is why these targets used to
        // need no rename; v4 keeps it, and without this the files land in
        // `dist/assets/assets/` and every page fails to load them.
        //
        // Each target gets the stripBase that matches its own glob depth:
        // `assets/*` already reaches the fonts/ and images/ subdirectories, so
        // the dedicated targets below must strip the extra `fonts/`+`assets/`
        // segments instead of copying those files a second time under
        // `assets/fonts/fonts/`.
        { src: 'assets/*', dest: 'assets', rename: { stripBase: 1 } },
        { src: 'assets/fonts/*', dest: 'assets/fonts', rename: { stripBase: 2 } },
        { src: 'assets/images/*', dest: 'assets/images', rename: { stripBase: 2 } },
        { src: 'bangladesh-map.png', dest: '.' },
        { src: 'bd_districts.js', dest: '.' },
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