import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Prompt strategy with a hand-written worker (injectManifest). The worker
      // installs and WAITS — it never skipWaiting()s on install and never
      // clientsClaim()s automatically. Activation is driven only by a user tap
      // (SKIP_WAITING message) or a cold start, which avoids the iOS standalone
      // freeze caused by a controllerchange firing mid-launch. Registration is
      // done by hand in src/pwa/pwa.ts, so we disable the auto-injected one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Kellogg-Reed Diagrammer',
        short_name: 'KR Diagram',
        description:
          'Create, edit, and export hybrid Kellogg-Reed sentence diagrams for English and Koine/Biblical Greek.',
        theme_color: '#1f2933',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
});
