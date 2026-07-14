import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  from,
  InMemoryCache,
  Observable,
} from '@apollo/client/core'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import type { GraphQLFormattedError } from 'graphql'

import { firebaseAuth } from '@/config/firebase'

type SessionExpiredHandler = (message: string) => Promise<void> | void

let sessionExpiredHandler: SessionExpiredHandler | null = null

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_BACKEND_URL,
})

const authLink = setContext(async (_, { headers }) => {
  const user = firebaseAuth.currentUser

  if (!user) {
    return { headers }
  }

  const token = await user.getIdToken()

  return {
    headers: {
      ...headers,
      authorization: `Bearer ${token}`,
    },
  }
})

function isAuthenticationFailure(
  graphQLErrors?: readonly GraphQLFormattedError[],
  networkStatusCode?: number,
): boolean {
  if (networkStatusCode === 401) {
    return true
  }

  return (
    graphQLErrors?.some(error => {
      const code = error.extensions?.code
      return code === 'UNAUTHENTICATED' || code === 'FORBIDDEN'
    }) ?? false
  )
}

const authRetryLink = new ApolloLink((operation, forward) => {
  return new Observable(observer => {
    const handleError = (error: unknown): void => {
      void (async () => {
        const context = operation.getContext() as { authRetry?: boolean }
        const graphQLErrors =
          typeof error === 'object' &&
          error !== null &&
          'graphQLErrors' in error
            ? (error.graphQLErrors as readonly GraphQLFormattedError[])
            : undefined
        const networkError =
          typeof error === 'object' && error !== null && 'networkError' in error
            ? (error.networkError as { statusCode?: number })
            : undefined

        const authFailure = isAuthenticationFailure(
          graphQLErrors,
          networkError?.statusCode,
        )

        if (!authFailure || context.authRetry) {
          observer.error(error)
          return
        }

        try {
          const user = firebaseAuth.currentUser

          if (!user) {
            throw new Error('No authenticated Firebase user')
          }

          await user.getIdToken(true)
          operation.setContext({ ...context, authRetry: true })

          forward(operation).subscribe({
            next: result => observer.next(result),
            error: retryError => observer.error(retryError),
            complete: () => observer.complete(),
          })
        } catch {
          await sessionExpiredHandler?.(
            'Uw sessie is verlopen. Log opnieuw in.',
          )
          observer.error(error)
        }
      })()
    }

    const subscription = forward(operation).subscribe({
      next: result => observer.next(result),
      error: handleError,
      complete: () => observer.complete(),
    })

    return () => subscription.unsubscribe()
  })
})

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (import.meta.env.DEV) {
    if (graphQLErrors) {
      graphQLErrors.forEach(error => {
        console.error('[GraphQL error]', error.message)
      })
    }
    if (networkError) {
      console.error('[Network error]', networkError.message)
    }
  }
})

const apolloClient = new ApolloClient({
  link: from([errorLink, authRetryLink, authLink, httpLink]),
  cache: new InMemoryCache(),
})

export function registerSessionExpiredHandler(
  handler: SessionExpiredHandler,
): void {
  sessionExpiredHandler = handler
}

export async function clearApolloCache(): Promise<void> {
  await apolloClient.clearStore()
}

export default function useGraphQL() {
  return { apolloClient }
}
