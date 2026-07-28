import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pwaRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  // Vite does not inject `.env` into `process.env` for config evaluation.
  // Load explicitly so local `VITE_PWA_DEV=true` enables the SW for Web Push.
  const env = loadEnv(mode, pwaRoot, '')
  const pwaDevEnabled =
    process.env.VITE_PWA_DEV === 'true' || env.VITE_PWA_DEV === 'true'

  return {
    plugins: [
      vue(),
      // Primary maps to Tailwind `teal` (#0d9488 at 600) — matches PWA theme_color.
      ui({
        ui: {
          colors: {
            primary: 'teal',
          },
        },
      }),
      VitePWA({
        // Prompt the user before activating a waiting service worker.
        registerType: 'prompt',
        // Custom SW for Web Push + Workbox precache (Phase 27A).
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}'],
        },
        // Keep the Vite dev server free of stale service workers by default.
        // Enable with `VITE_PWA_DEV=true` (shell or packages/pwa/.env) for local push.
        devOptions: {
          enabled: pwaDevEnabled,
          type: 'module',
        },
        includeAssets: [
          'favicon-32.png',
          'offline.html',
          'icons/icon-192.png',
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
          'icons/icon.svg',
        ],
        manifest: {
          name: 'Vaccinatie-levering',
          short_name: 'Vaccin',
          description:
            'Platform for vaccine orders, stock and delivery routes.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#0d9488',
          background_color: '#f0fdfa',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
    },
  }
})
