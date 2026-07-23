/**
 * Playwright PWA webServer entrypoint.
 * Must be self-contained on a clean checkout (no pre-existing packages/types/dist).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const pwaRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Monorepo root (examMaciej/) — required for `npm run generate:graphql`. */
const repoRoot = join(pwaRoot, '..', '..')

const env = {
  ...process.env,
  VITE_E2E_AUTH_BYPASS: 'true',
  VITE_BACKEND_URL: 'http://127.0.0.1:3100/graphql',
  VITE_BACKEND_WS_URL: 'ws://127.0.0.1:3100/graphql',
  VITE_FIREBASE_API_KEY: 'playwright-e2e',
  VITE_FIREBASE_AUTH_DOMAIN: 'playwright-e2e.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'playwright-e2e',
  VITE_FIREBASE_STORAGE_BUCKET: 'playwright-e2e.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: '1:0:web:playwright',
}

function logStage(message) {
  console.log(`[e2e-preview] ${message}`)
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: true,
    })

    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} (cwd=${cwd}) exited with ${code}`,
          ),
        )
      }
    })
  })
}

logStage('generating GraphQL schema/types')
// Root authoritative pipeline — regenerates schema + packages/types/dist.
await run('npm', ['run', 'generate:graphql'], repoRoot)

logStage('building PWA')
await run('npm', ['run', 'build:e2e'], pwaRoot)

logStage('starting Vite preview')
await run('npm', ['run', 'preview:e2e'], pwaRoot)
