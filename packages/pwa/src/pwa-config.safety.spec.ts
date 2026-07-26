import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pwaRoot = join(__dirname, '..')
const viteConfigPath = join(pwaRoot, 'vite.config.ts')
const publicDir = join(pwaRoot, 'public')
const offlineHtmlPath = join(publicDir, 'offline.html')
const distDir = join(pwaRoot, 'dist')
const swSourcePath = join(pwaRoot, 'src', 'sw.ts')

describe('PWA safety and configuration', () => {
  const viteConfig = readFileSync(viteConfigPath, 'utf8')
  const offlineHtml = readFileSync(offlineHtmlPath, 'utf8')
  const swSource = readFileSync(swSourcePath, 'utf8')

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

  it('uses injectManifest with custom SW for push + NetworkOnly navigations', () => {
    expect(viteConfig).toContain("strategies: 'injectManifest'")
    expect(viteConfig).toContain("filename: 'sw.ts'")
    expect(viteConfig).not.toMatch(
      /navigateFallback:\s*['"]\/offline\.html['"]/,
    )
    expect(swSource).toContain('NetworkOnly')
    expect(swSource).toContain('/offline.html')
    expect(swSource).toContain('/graphql')
    expect(swSource).toContain('/api')
  })

  it('loads VITE_PWA_DEV from .env via loadEnv so local Web Push SW can enable', () => {
    // Regression: process.env alone misses packages/pwa/.env during config eval.
    expect(viteConfig).toContain('loadEnv')
    expect(viteConfig).toMatch(/env\.VITE_PWA_DEV\s*===\s*['"]true['"]/)
    expect(viteConfig).toMatch(
      /process\.env\.VITE_PWA_DEV\s*===\s*['"]true['"]/,
    )
  })

  it('GraphQL endpoints are not runtime cached', () => {
    expect(viteConfig).not.toMatch(/urlPattern:.*graphql/i)
    expect(viteConfig).not.toMatch(/cacheName:\s*['"][^'"]*graphql[^'"]*['"]/i)
    expect(swSource).toContain('NetworkOnly')
    expect(swSource).not.toContain('NetworkFirst')
    expect(swSource).not.toContain('CacheFirst')
    expect(swSource).not.toContain('StaleWhileRevalidate')
    expect(viteConfig).not.toContain('NetworkFirst')
    expect(viteConfig).not.toContain('CacheFirst')
    expect(viteConfig).not.toContain('StaleWhileRevalidate')
  })

  it('authenticated GraphQL route responses are not service-worker cached', () => {
    // IndexedDB is the explicit private-data cache (Phase 28A).
    expect(swSource).not.toMatch(/registerRoute\([^)]*graphql/i)
    expect(swSource).not.toMatch(/urlPattern:.*graphql/i)
    expect(swSource).toContain('/graphql')
    expect(swSource).toMatch(/pathname\.includes\(['"]\/graphql['"]\)/)
    expect(swSource).not.toContain('CacheFirst')
    expect(swSource).not.toContain('NetworkFirst')
    expect(swSource).not.toContain('StaleWhileRevalidate')
  })

  it('QR SVG / delivery-route REST endpoints are not service-worker cached', () => {
    expect(swSource).not.toMatch(/delivery-routes.*qr|\/qr['"]/i)
    expect(swSource).not.toContain('delivery-routes')
    expect(viteConfig).not.toMatch(/delivery-routes|qrImage|qr\.svg/i)
    expect(swSource).not.toContain('CacheFirst')
  })

  it('route and stop manifest PDF endpoints are not service-worker cached', () => {
    expect(swSource).not.toMatch(/manifest\.pdf/i)
    expect(swSource).not.toContain('delivery-routes')
    expect(viteConfig).not.toMatch(/manifest\.pdf/i)
    expect(swSource).not.toContain('CacheFirst')
    expect(swSource).not.toContain('NetworkFirst')
    expect(swSource).not.toContain('StaleWhileRevalidate')
  })

  it('manifest PDF helpers require auth headers and never write offline stores', () => {
    const restHelper = readFileSync(
      join(pwaRoot, 'src', 'api', 'delivery-manifest-rest.ts'),
      'utf8',
    )
    expect(restHelper).toContain('Authorization')
    expect(restHelper).toContain('Bearer ${token}')
    expect(restHelper).toContain("cache: 'no-store'")
    expect(restHelper).toContain('application/pdf')
    expect(restHelper).not.toMatch(
      /\bindexedDB\b|\bopenDB\b|\bfrom ['"]idb['"]/i,
    )
    expect(restHelper).toContain('URL.revokeObjectURL')
  })

  it('Firebase Auth endpoints are not runtime cached', () => {
    expect(viteConfig).not.toMatch(
      /urlPattern:\s*.*(identitytoolkit|securetoken\.google|googleapis\.com\/identitytoolkit)/i,
    )
    expect(swSource).not.toMatch(/identitytoolkit|securetoken\.google/i)
  })

  it('private API responses are not cached', () => {
    expect(viteConfig).not.toContain('CacheFirst')
    expect(viteConfig).not.toContain('StaleWhileRevalidate')
    expect(viteConfig).not.toContain('NetworkFirst')
    expect(swSource).not.toContain('CacheFirst')
    expect(swSource).not.toContain('StaleWhileRevalidate')
    expect(swSource).not.toContain('NetworkFirst')
  })

  it('service worker precaches only safe static assets', () => {
    expect(viteConfig).toContain(
      "globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webp}']",
    )
    expect(viteConfig).toContain("registerType: 'prompt'")
    expect(swSource).toContain('/offline.html')
  })

  it('custom SW handles push with visible-client suppression', () => {
    expect(swSource).toContain("addEventListener('push'")
    expect(swSource).toContain('shouldDisplayOsNotification')
    expect(swSource).toContain('showNotification')
    expect(swSource).toContain("addEventListener('notificationclick'")
    expect(swSource).toContain('focusOrOpenActionPath')
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
      expect(swSource).not.toContain(mention)
    }
  })

  it('no token or credential is written into cache configuration', () => {
    expect(viteConfig).not.toMatch(/authorization|idToken|refreshToken|Bearer/i)
    expect(viteConfig).not.toContain('localStorage')
    expect(viteConfig).not.toContain('IndexedDB')
    expect(swSource).not.toMatch(/authorization|idToken|refreshToken|Bearer/i)
  })

  it('Playwright E2E preview generates GraphQL types before vite build', () => {
    const previewScriptPath = join(pwaRoot, 'scripts', 'run-e2e-preview.mjs')
    expect(existsSync(previewScriptPath)).toBe(true)
    const script = readFileSync(previewScriptPath, 'utf8')

    expect(script).toContain("['run', 'generate:graphql']")
    expect(script).toContain('repoRoot')
    expect(script).toMatch(/join\(pwaRoot,\s*'\.\.',\s*'\.\.'\)/)

    const generateAt = script.indexOf("['run', 'generate:graphql']")
    const buildAt = script.indexOf("['run', 'build:e2e']")
    const previewAt = script.indexOf("['run', 'preview:e2e']")
    expect(generateAt).toBeGreaterThan(-1)
    expect(buildAt).toBeGreaterThan(generateAt)
    expect(previewAt).toBeGreaterThan(buildAt)

    expect(script).toContain('generating GraphQL schema/types')
    expect(script).toContain('building PWA')
    expect(script).toContain('starting Vite preview')

    expect(script).not.toMatch(/existsSync\([^)]*types[/\\]dist/)
    expect(script).not.toMatch(/types\/dist\/graphql/)
  })

  it('production build emits index.html, offline.html, manifest and sw.js', () => {
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
    expect(sw).not.toContain('createHandlerBoundToURL("/offline.html")')
    expect(sw).not.toContain("createHandlerBoundToURL('/offline.html')")
    expect(sw).not.toMatch(/identitytoolkit|securetoken\.google/i)
    // After injectManifest rebuild, push handlers are present. Stale generateSW
    // artefacts from before Phase 27A are ignored until the next production build.
    if (
      sw.includes('shouldDisplayOsNotification') ||
      sw.includes('PUSH_SUPPRESSED')
    ) {
      expect(sw).toMatch(/showNotification|notificationclick/)
    }
  })

  it('Firebase Hosting config mirrors nginx cache and SPA rules', () => {
    const hostingPath = join(pwaRoot, '..', '..', 'firebase.json')
    expect(existsSync(hostingPath)).toBe(true)
    const hosting = JSON.parse(readFileSync(hostingPath, 'utf8'))
    expect(hosting.hosting.public).toBe('packages/pwa/dist')
    expect(hosting.functions).toBeUndefined()
    const headers = hosting.hosting.headers as Array<{
      source: string
      headers: Array<{ key: string; value: string }>
    }>
    const cacheFor = (source: string) =>
      headers
        .find(h => h.source === source)
        ?.headers.find(x => x.key === 'Cache-Control')?.value
    expect(cacheFor('/index.html')).toMatch(/no-cache|no-store/)
    expect(cacheFor('/sw.js')).toMatch(/no-cache|no-store/)
    expect(cacheFor('/offline.html')).toMatch(/no-cache|no-store/)
    expect(cacheFor('/assets/**')).toMatch(/immutable/)
  })
})
