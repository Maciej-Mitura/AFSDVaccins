/**
 * Lightweight static checks for Phase 19 production Docker artefacts.
 * Run: node --test infrastructure/docker-production.safety.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const composePath = join(
  root,
  'infrastructure',
  'docker-compose-production.yml',
)
const envExamplePath = join(root, 'infrastructure', '.env.prod.example')
const apiDockerfile = join(root, 'packages', 'api', 'Dockerfile')
const pwaDockerfile = join(root, 'packages', 'pwa', 'Dockerfile')
const nginxConf = join(root, 'packages', 'pwa', 'nginx.conf')
const dockerignore = join(root, '.dockerignore')

function read(path) {
  return readFileSync(path, 'utf8')
}

describe('production Docker safety', () => {
  it('required Docker files exist', () => {
    for (const path of [
      composePath,
      envExamplePath,
      apiDockerfile,
      pwaDockerfile,
      nginxConf,
      dockerignore,
    ]) {
      assert.equal(existsSync(path), true, `missing ${path}`)
    }
  })

  it('compose keeps production NODE_ENV and disables seed/bypass', () => {
    const compose = read(composePath)
    assert.match(compose, /NODE_ENV:\s*production/)
    assert.match(compose, /ALLOW_DATABASE_SEED:\s*'false'/)
    assert.match(compose, /ALLOW_E2E_AUTH_BYPASS:\s*'false'/)
    assert.match(compose, /vaccin-delivery-mongo-prod-data/)
    assert.match(compose, /vaccin-delivery-production-demo/)
    assert.doesNotMatch(compose, /VITE_E2E_AUTH_BYPASS:\s*['"]?true/)
    assert.doesNotMatch(compose, /ALLOW_E2E_AUTH_BYPASS:\s*'true'/)
    assert.doesNotMatch(compose, /Desktop\\afsdVaccins/)
    assert.doesNotMatch(compose, /maciejafsdvaccin-firebase/)
  })

  it('compose uses FIREBASE_CREDENTIALS_HOST_PATH bind mount', () => {
    const compose = read(composePath)
    assert.match(compose, /FIREBASE_CREDENTIALS_HOST_PATH/)
    assert.match(compose, /\/run\/secrets\/firebase-sa\.json/)
    assert.match(compose, /read_only:\s*true/)
  })

  it('env example never enables Playwright bypass or commits secrets', () => {
    const example = read(envExamplePath)
    assert.doesNotMatch(example, /VITE_E2E_AUTH_BYPASS\s*=\s*true/)
    assert.doesNotMatch(example, /ALLOW_E2E_AUTH_BYPASS\s*=\s*true/)
    assert.match(example, /FIREBASE_CREDENTIALS_HOST_PATH=/)
    assert.match(example, /DB_NAME=vaccin-delivery-production-demo/)
    assert.match(example, /VITE_BACKEND_URL=http:\/\/localhost:3000\/graphql/)
    assert.match(example, /URL_FRONTEND=http:\/\/localhost:8080/)
  })

  it('env example documents personal and teacher ADMIN seed variables', () => {
    const example = read(envExamplePath)
    assert.match(example, /SEED_PERSONAL_ADMIN_EMAIL=/)
    assert.match(example, /SEED_PERSONAL_ADMIN_FIREBASE_UID=/)
    assert.match(example, /SEED_TEACHER_ADMIN_PASSWORD=/)
    assert.match(example, /SEED_DEMO_PASSWORD=/)
  })

  it('PWA Dockerfile refuses enabled VITE_E2E_AUTH_BYPASS', () => {
    const dockerfile = read(pwaDockerfile)
    assert.match(dockerfile, /VITE_E2E_AUTH_BYPASS/)
    assert.match(dockerfile, /must not be enabled/)
    assert.match(dockerfile, /nginxinc\/nginx-unprivileged/)
  })

  it('API Dockerfile uses production start and non-root user', () => {
    const dockerfile = read(apiDockerfile)
    assert.match(dockerfile, /NODE_ENV=production/)
    assert.match(dockerfile, /dist\/main\.js/)
    assert.match(dockerfile, /USER vaccin/)
    assert.match(dockerfile, /npm ci/)
    assert.doesNotMatch(dockerfile, /ts-node/)
  })

  it('nginx SPA fallback uses index.html not offline.html', () => {
    const nginx = read(nginxConf)
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/)
    assert.doesNotMatch(nginx, /try_files \$uri \$uri\/ \/offline\.html/)
    assert.match(nginx, /location = \/sw\.js/)
    assert.match(nginx, /location = \/manifest\.webmanifest/)
  })

  it('dockerignore excludes secrets, env files, and node_modules', () => {
    const ignore = read(dockerignore)
    assert.match(ignore, /node_modules/)
    assert.match(ignore, /\.env/)
    assert.match(ignore, /firebase/)
    assert.match(ignore, /infrastructure\/\.env\.prod/)
  })

  it('CI compose env uses placeholders and never enables Playwright bypass', () => {
    const ciEnvPath = join(root, 'infrastructure', '.env.prod.ci')
    const placeholderPath = join(
      root,
      'infrastructure',
      'ci-compose-credential.placeholder.json',
    )
    assert.equal(existsSync(ciEnvPath), true, 'missing .env.prod.ci')
    assert.equal(
      existsSync(placeholderPath),
      true,
      'missing ci-compose-credential.placeholder.json',
    )
    const ciEnv = read(ciEnvPath)
    assert.doesNotMatch(ciEnv, /VITE_E2E_AUTH_BYPASS\s*=\s*true/)
    assert.doesNotMatch(ciEnv, /ALLOW_E2E_AUTH_BYPASS\s*=\s*true/)
    assert.match(ciEnv, /FIREBASE_CREDENTIALS_HOST_PATH=/)
    assert.match(ciEnv, /ci-placeholder/)
    const placeholder = read(placeholderPath)
    assert.match(placeholder, /CI_PLACEHOLDER_NOT_A_REAL_PRIVATE_KEY/)
    assert.match(placeholder, /"project_id": "ci-placeholder"/)
  })
})
