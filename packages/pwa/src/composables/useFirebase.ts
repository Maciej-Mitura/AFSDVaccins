import { computed, ref, type Ref } from 'vue'
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
import {
  e2eBypassLogin,
  e2eBypassLogout,
  getE2eBypassUser,
  isE2eAuthBypassEnabled,
  subscribeE2eBypassAuth,
  type E2eBypassUser,
} from '@/firebase/e2e-auth-bypass'

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

type AuthUserView = User | E2eBypassUser

const firebaseUser = ref<AuthUserView | null>(null)
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

  if (isE2eAuthBypassEnabled()) {
    authReadyPromise = Promise.resolve().then(() => {
      firebaseUser.value = getE2eBypassUser()
      authLoading.value = false
      authInitialized.value = true
    })

    subscribeE2eBypassAuth(user => {
      firebaseUser.value = user
      authLoading.value = false
      authInitialized.value = true
    })
    return
  }

  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not initialized')
  }

  const auth = firebaseAuth

  authReadyPromise = new Promise<void>(resolve => {
    onAuthStateChanged(auth, user => {
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
  ): Promise<AuthUserView> {
    if (isE2eAuthBypassEnabled()) {
      throw new Error(
        'Registreren is niet beschikbaar in de Playwright auth-bypass modus.',
      )
    }

    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not initialized')
    }

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

  async function login(email: string, password: string): Promise<AuthUserView> {
    if (isE2eAuthBypassEnabled()) {
      try {
        const user = e2eBypassLogin(email, password)
        firebaseUser.value = user
        return user
      } catch (error: unknown) {
        throw new Error(mapFirebaseAuthError(error))
      }
    }

    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not initialized')
    }

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
    if (isE2eAuthBypassEnabled()) {
      throw new Error(
        'Wachtwoord reset is niet beschikbaar in de Playwright auth-bypass modus.',
      )
    }

    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not initialized')
    }

    try {
      await sendPasswordResetEmail(firebaseAuth, email)
    } catch (error: unknown) {
      throw new Error(mapFirebaseAuthError(error))
    }
  }

  async function logout(): Promise<void> {
    if (isE2eAuthBypassEnabled()) {
      e2eBypassLogout()
      firebaseUser.value = null
      return
    }

    if (!firebaseAuth) {
      throw new Error('Firebase Auth is not initialized')
    }

    await signOut(firebaseAuth)
    firebaseUser.value = null
  }

  async function getIdToken(forceRefresh = false): Promise<string | null> {
    if (isE2eAuthBypassEnabled()) {
      const user = getE2eBypassUser()
      return user ? user.getIdToken(forceRefresh) : null
    }

    const user = firebaseAuth?.currentUser

    if (!user) {
      return null
    }

    return user.getIdToken(forceRefresh)
  }

  return {
    firebaseUser: firebaseUser as Ref<AuthUserView | null>,
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
