import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    ui(),
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
      // Enable with `VITE_PWA_DEV=true` only when intentionally testing SW locally.
      devOptions: {
        enabled: process.env.VITE_PWA_DEV === 'true',
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
          'Platform voor vaccinbestellingen, voorraad en bezorgroutes.',
        lang: 'nl',
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
})
