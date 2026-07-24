/**
 * Offline production-readiness checks for Phase 24B.
 * Never contacts Railway, Firebase, or Atlas. Never requires real secrets.
 *
 * Run: npm run validate:production-readiness
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8')
}

function assertNoSecretPatterns(content, label) {
  assert.doesNotMatch(
    content,
    /-----BEGIN PRIVATE KEY-----/,
    `${label} must not contain private keys`,
  )
  assert.doesNotMatch(
    content,
    /AIzaSy[A-Za-z0-9_-]{35,}/,
    `${label} must not contain real-looking Firebase API keys`,
  )
  // Flag only credential-shaped Atlas hosts (not angle-bracket placeholders).
  assert.doesNotMatch(
    content,
    /mongodb\+srv:\/\/(?!<)[A-Za-z0-9._%-]+:(?!<)[^@\s]+@[a-z0-9.-]+\.mongodb\.net/i,
    `${label} must not contain real Atlas URIs`,
  )
}

describe('production readiness (offline)', () => {
  it('Firebase Hosting config targets PWA dist with SPA rewrite and safe cache headers', () => {
    const firebaseJson = JSON.parse(read('firebase.json'))
    assert.equal(firebaseJson.hosting.public, 'packages/pwa/dist')
    assert.ok(
      firebaseJson.hosting.rewrites?.some(
        (r) => r.source === '**' && r.destination === '/index.html',
      ),
    )
    assert.equal(firebaseJson.functions, undefined)
    const headers = firebaseJson.hosting.headers ?? []
    const bySource = Object.fromEntries(
      headers.map((h) => [h.source, h.headers[0]?.value]),
    )
    assert.match(bySource['/index.html'] ?? '', /no-cache|no-store/)
    assert.match(bySource['/sw.js'] ?? '', /no-cache|no-store/)
    assert.match(bySource['/offline.html'] ?? '', /no-cache|no-store/)
    assert.match(bySource['/assets/**'] ?? '', /immutable/)
  })

  it('.firebaserc.example uses a placeholder project id only', () => {
    const example = JSON.parse(read('.firebaserc.example'))
    assert.equal(example.projects.default, 'YOUR_FIREBASE_PROJECT_ID')
    assert.equal(existsSync(join(root, '.firebaserc')), false)
  })

  it('API Docker CMD starts the HTTP server, not bootstrap/seed', () => {
    const dockerfile = read('packages/api/Dockerfile')
    assert.match(dockerfile, /CMD \["node", "dist\/main\.js"\]/)
    assert.doesNotMatch(dockerfile, /bootstrap-cli/)
    assert.doesNotMatch(dockerfile, /cli\.js/)
  })

  it('API env example documents Railway credential and trust proxy', () => {
    const example = read('packages/api/.env.example')
    assert.match(example, /FIREBASE_SERVICE_ACCOUNT_JSON=/)
    assert.match(example, /GOOGLE_APPLICATION_CREDENTIALS=/)
    assert.match(example, /TRUST_PROXY=/)
    assert.match(example, /ALLOW_DATABASE_BOOTSTRAP=/)
    assert.match(example, /CONFIRM_DATABASE_BOOTSTRAP=/)
    assert.match(example, /BOOTSTRAP_PUBLIC_DEMO_DATABASE/)
    assert.match(example, /mongodb\+srv:\/\/<user>:<password>@<cluster-host>\//)
    assertNoSecretPatterns(example, 'api .env.example')
  })

  it('PWA env example keeps public placeholders only', () => {
    const example = read('packages/pwa/.env.example')
    assert.match(example, /VITE_BACKEND_URL=/)
    assert.match(example, /VITE_BACKEND_WS_URL=/)
    assert.doesNotMatch(example, /^[^#\n]*VITE_E2E_AUTH_BYPASS\s*=\s*true/m)
    assertNoSecretPatterns(example, 'pwa .env.example')
  })

  it('deployment runbook exists and sequences Atlas → Railway → bootstrap → Hosting', () => {
    const runbook = read('docs/deployment.md')
    assert.match(runbook, /MongoDB Atlas/)
    assert.match(runbook, /Railway/)
    assert.match(runbook, /Firebase Hosting/)
    assert.match(runbook, /ALLOW_DATABASE_BOOTSTRAP/)
    assert.match(runbook, /BOOTSTRAP_PUBLIC_DEMO_DATABASE/)
    assert.match(runbook, /TRUST_PROXY=1/)
    assert.match(runbook, /FIREBASE_SERVICE_ACCOUNT_JSON/)
    assert.match(runbook, /exactly one replica|single replica/i)
    assert.match(runbook, /Serverless/)
  })

  it('no tracked firebase service account JSON files', () => {
    const trackedSecrets = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git'
        ) {
          continue
        }
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (
          /firebase.*adminsdk|firebase-service-account\.json$/i.test(
            entry.name,
          ) &&
          !entry.name.endsWith('.example') &&
          !entry.name.includes('placeholder')
        ) {
          trackedSecrets.push(full)
        }
      }
    }
    walk(root)
    assert.deepEqual(trackedSecrets, [])
  })
})
