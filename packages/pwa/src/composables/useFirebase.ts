import { computed, ref } from 'vue'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'

import { firebaseAuth } from '@/config/firebase'

export type AuthErrorCode =
  | 'auth/email-already-in-use'
  | 'auth/invalid-email'
  | 'auth/invalid-credential'
  | 'auth/too-many-requests'
  | 'auth/user-disabled'
  | 'auth/user-not-found'
  | 'auth/weak-password'
  | 'auth/network-request-failed'
  | 'auth/unknown'

const firebaseUser = ref<User | null>(null)
const authLoading = ref(true)
const authInitialized = ref(false)

let authReadyPromise: Promise<void> | null = null
let authListenerRegistered = false

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'auth/unknown'

  switch (code as AuthErrorCode) {
    case 'auth/email-already-in-use':
      return 'Dit e-mailadres is al in gebruikt.'
    case 'auth/invalid-email':
      return 'Voer een geldig e-mailadres in.'
    case 'auth/invalid-credential':
      return 'Onjuiste inloggegevens. Controleer e-mail en wachtwoord.'
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het later opnieuw.'
    case 'auth/user-disabled':
      return 'Dit account is uitgeschakeld.'
    case 'auth/user-not-found':
      return 'Geen account gevonden voor dit e-mailadres.'
    case 'auth/weak-password':
      return 'Kies een wachtwoord van minstens 8 tekens.'
    case 'auth/network-request-failed':
      return 'Netwerkfout. Controleer je internetverbinding.'
    default:
      return 'Er ging iets mis. Probeer het opnieuw.'
  }
}

function ensureAuthListener(): void {
  if (authListenerRegistered) {
    return
  }

  authListenerRegistered = true

  authReadyPromise = new Promise<void>(resolve => {
    onAuthStateChanged(firebaseAuth, user => {
      firebaseUser.value = user
      authLoading.value = false
      authInitialized.value = true
      resolve()
    })
  })
}

export function useFirebase() {
  ensureAuthListener()

  const isAuthenticated = computed(() => firebaseUser.value !== null)

  async function waitForAuthRestoration(): Promise<void> {
    ensureAuthListener()
    await authReadyPromise
  }

  async function register(
    displayName: string,
    email: string,
    password: string,
  ): Promise<User> {
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email,
        password,
      )

      await updateProfile(credential.user, { displayName })
      firebaseUser.value = credential.user

      return credential.user
    } catch (error: unknown) {
      throw new Error(mapFirebaseAuthError(error))
    }
  }

  async function login(email: string, password: string): Promise<User> {
    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password,
      )
      firebaseUser.value = credential.user

      return credential.user
    } catch (error: unknown) {
      throw new Error(mapFirebaseAuthError(error))
    }
  }

  async function requestPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(firebaseAuth, email)
    } catch (error: unknown) {
      throw new Error(mapFirebaseAuthError(error))
    }
  }

  async function logout(): Promise<void> {
    await signOut(firebaseAuth)
    firebaseUser.value = null
  }

  async function getIdToken(forceRefresh = false): Promise<string | null> {
    const user = firebaseAuth.currentUser

    if (!user) {
      return null
    }

    return user.getIdToken(forceRefresh)
  }

  return {
    firebaseUser,
    authLoading,
    authInitialized,
    isAuthenticated,
    waitForAuthRestoration,
    register,
    login,
    requestPasswordReset,
    logout,
    getIdToken,
  }
}
