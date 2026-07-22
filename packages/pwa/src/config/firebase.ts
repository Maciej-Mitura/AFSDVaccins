import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

import { isE2eAuthBypassEnabled } from '@/firebase/e2e-auth-bypass'

const bypass = isE2eAuthBypassEnabled()

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * Real Firebase is initialized only when the Playwright auth bypass is off.
 * Bypass builds use placeholder VITE_FIREBASE_* values and never call the SDK.
 */
export const firebaseApp: FirebaseApp | null = bypass
  ? null
  : initializeApp(firebaseConfig)

export const firebaseAuth: Auth | null = bypass
  ? null
  : getAuth(firebaseApp as FirebaseApp)
