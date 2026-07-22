import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: true,
    })

    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
  })
}

await run('npm', ['run', 'build:e2e'])
await run('npm', ['run', 'preview:e2e'])
