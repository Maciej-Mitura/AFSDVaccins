import { firebaseAuth } from '@/config/firebase'
import {
  getE2eBypassUser,
  isE2eAuthBypassEnabled,
  resolveE2eBypassBearerToken,
} from '@/firebase/e2e-auth-bypass'

export async function resolveAuthBearerToken(
  forceRefresh = false,
): Promise<string | null> {
  if (isE2eAuthBypassEnabled()) {
    return resolveE2eBypassBearerToken()
  }

  const user = firebaseAuth?.currentUser

  if (!user) {
    return null
  }

  return user.getIdToken(forceRefresh)
}

export function resolveAuthUid(): string | null {
  if (isE2eAuthBypassEnabled()) {
    return getE2eBypassUser()?.uid ?? null
  }

  return firebaseAuth?.currentUser?.uid ?? null
}
