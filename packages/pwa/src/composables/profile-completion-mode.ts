import { UserRole } from '@vaccin-delivery/types'

export type ProfileCompletionMode =
  | 'loading'
  | 'unregistered'
  | 'apotheker'
  | 'bezorger'
  | 'admin'
  | 'unsupported'

export type ProfileCompletionUser = {
  role: UserRole
} | null

/**
 * Derives the profile-completion UI mode strictly from the application User.role.
 * Never defaults to pharmacist while the user is still loading.
 */
export function resolveProfileCompletionMode(options: {
  authReady: boolean
  userLoading: boolean
  userInitialized: boolean
  currentUser: ProfileCompletionUser
  missingApplicationUser: boolean
}): ProfileCompletionMode {
  const {
    authReady,
    userLoading,
    userInitialized,
    currentUser,
    missingApplicationUser,
  } = options

  if (!authReady || userLoading || !userInitialized) {
    return 'loading'
  }

  if (missingApplicationUser || currentUser == null) {
    return 'unregistered'
  }

  switch (currentUser.role) {
    case UserRole.Apotheker:
      return 'apotheker'
    case UserRole.Bezorger:
      return 'bezorger'
    case UserRole.Admin:
      return 'admin'
    default:
      return 'unsupported'
  }
}
