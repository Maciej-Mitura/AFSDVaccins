import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pwaRoot = join(__dirname, '..')
const viteConfigPath = join(pwaRoot, 'vite.config.ts')
const publicDir = join(pwaRoot, 'public')
const offlineHtmlPath = join(publicDir, 'offline.html')
const distDir = join(pwaRoot, 'dist')

describe('PWA safety and configuration', () => {
  const viteConfig = readFileSync(viteConfigPath, 'utf8')
  const offlineHtml = readFileSync(offlineHtmlPath, 'utf8')

  it('manifest contains required fields', () => {
    expect(viteConfig).toContain("name: 'Vaccinatie-levering'")
    expect(viteConfig).toContain("short_name: 'Vaccin'")
    expect(viteConfig).toContain("display: 'standalone'")
    expect(viteConfig).toContain("start_url: '/'")
    expect(viteConfig).toContain("scope: '/'")
    expect(viteConfig).toContain("lang: 'nl'")
    expect(viteConfig).toContain('theme_color')
    expect(viteConfig).toContain('background_color')
    expect(viteConfig).toContain('icons/icon-192.png')
    expect(viteConfig).toContain('icons/icon-512.png')
  })

  it('required icons exist', () => {
    expect(existsSync(join(publicDir, 'icons/icon-192.png'))).toBe(true)
    expect(existsSync(join(publicDir, 'icons/icon-512.png'))).toBe(true)
    expect(existsSync(join(publicDir, 'icons/icon-maskable-512.png'))).toBe(
      true,
    )
    expect(existsSync(join(publicDir, 'favicon-32.png'))).toBe(true)
    expect(existsSync(offlineHtmlPath)).toBe(true)
  })

  it('retry action navigates to /', () => {
    expect(offlineHtml).toContain("window.location.replace('/')")
    expect(offlineHtml).not.toContain('location.reload()')
  })

  it('online event navigates to /', () => {
    expect(offlineHtml).toContain("window.addEventListener('online'")
    expect(offlineHtml).toMatch(
      /addEventListener\('online',\s*goHome\)|online',\s*goHome/,
    )
  })

  it('normal router navigation does not resolve to /offline.html while online', () => {
    // Must not use offline.html as the Workbox NavigationRoute document.
    expect(viteConfig).not.toMatch(/navigateFallback:\s*['"]\/offline\.html['"]/)
    expect(viteConfig).toMatch(/navigateFallback:\s*['"]\/index\.html['"]/)
    expect(viteConfig).toContain("handler: 'NetworkOnly'")
    expect(viteConfig).toContain("fallbackURL: '/offline.html'")
    expect(viteConfig).toMatch(
      /urlPattern:\s*\(\{\s*request\s*\}\)\s*=>\s*request\.mode\s*===\s*['"]navigate['"]/,
    )
  })

  it('GraphQL endpoints are not runtime cached', () => {
    expect(viteConfig).not.toMatch(/urlPattern:.*graphql/i)
    expect(viteConfig).not.toMatch(
      /cacheName:\s*['"][^'"]*graphql[^'"]*['"]/i,
    )
    // Navigation NetworkOnly must not target GraphQL documents as a cache.
    expect(viteConfig).toContain("handler: 'NetworkOnly'")
    expect(viteConfig).not.toContain('NetworkFirst')
    expect(viteConfig).not.toContain('CacheFirst')
    expect(viteConfig).not.toContain('StaleWhileRevalidate')
  })

  it('Firebase Auth endpoints are not runtime cached', () => {
    expect(viteConfig).not.toMatch(
      /urlPattern:\s*.*(identitytoolkit|securetoken\.google|googleapis\.com\/identitytoolkit)/i,
    )
  })

  it('private API responses are not cached', () => {
    expect(viteConfig).not.toContain('CacheFirst')
    expect(viteConfig).not.toContain('StaleWhileRevalidate')
    expect(viteConfig).not.toContain('NetworkFirst')
  })

  it('service worker precaches only safe static assets', () => {
    expect(viteConfig).toContain(
      "globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}']",
    )
    expect(viteConfig).toContain("registerType: 'prompt'")
    expect(viteConfig).toContain("fallbackURL: '/offline.html'")
  })

  it('no offline mutation queue exists', () => {
    const queueMentions = [
      'offlineQueue',
      'mutationQueue',
      'BackgroundSyncPlugin',
      'workbox-background-sync',
    ]

    for (const mention of queueMentions) {
      expect(viteConfig).not.toContain(mention)
    }
  })

  it('no token or credential is written into cache configuration', () => {
    expect(viteConfig).not.toMatch(/authorization|idToken|refreshToken|Bearer/i)
    expect(viteConfig).not.toContain('localStorage')
    expect(viteConfig).not.toContain('IndexedDB')
  })

  it('production build emits index.html, offline.html, manifest and sw.js', () => {
    // Meaningful after `npm run build:pwa`. Skip assertions when dist is absent.
    if (!existsSync(distDir)) {
      return
    }

    expect(existsSync(join(distDir, 'index.html'))).toBe(true)
    expect(existsSync(join(distDir, 'offline.html'))).toBe(true)
    expect(existsSync(join(distDir, 'manifest.webmanifest'))).toBe(true)
    expect(existsSync(join(distDir, 'sw.js'))).toBe(true)

    const sw = readFileSync(join(distDir, 'sw.js'), 'utf8')
    expect(sw).toContain('offline.html')
    expect(sw).toContain('index.html')
    // Must not bind NavigationRoute exclusively to the offline document.
    expect(sw).not.toContain('createHandlerBoundToURL("/offline.html")')
    expect(sw).not.toContain("createHandlerBoundToURL('/offline.html')")
    expect(sw).not.toMatch(/identitytoolkit|securetoken\.google/i)
  })
})
