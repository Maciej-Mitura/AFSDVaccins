import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  from,
  InMemoryCache,
  Observable,
  split,
} from '@apollo/client/core'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'
import type { Client } from 'graphql-ws'
import { createClient } from 'graphql-ws'
import type { GraphQLFormattedError } from 'graphql'

import { firebaseAuth } from '@/config/firebase'
import { setRealtimeConnectionState } from '@/composables/useRealtimeConnection'

type SessionExpiredHandler = (message: string) => Promise<void> | void

let sessionExpiredHandler: SessionExpiredHandler | null = null
let wsClient: Client | null = null
let wsClientOwnerUid: string | null = null
let intentionalWsShutdown = false
let pendingReconnect = false

const reconnectHandlers = new Set<() => void | Promise<void>>()

export function registerReconnectHandler(
  handler: () => void | Promise<void>,
): () => void {
  reconnectHandlers.add(handler)

  return () => {
    reconnectHandlers.delete(handler)
  }
}

async function notifyReconnectHandlers(): Promise<void> {
  await Promise.all(
    [...reconnectHandlers].map(handler => Promise.resolve(handler())),
  )
}

function resolveBackendWsUrl(): string {
  const explicit = import.meta.env.VITE_BACKEND_WS_URL

  if (explicit) {
    return explicit
  }

  return import.meta.env.VITE_BACKEND_URL.replace(/^http/i, 'ws')
}

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

function createWebSocketClient(ownerUid: string): Client {
  intentionalWsShutdown = false

  return createClient({
    url: resolveBackendWsUrl(),
    retryAttempts: 5,
    shouldRetry: () => !intentionalWsShutdown,
    connectionParams: async () => {
      const user = firebaseAuth.currentUser

      if (!user || user.uid !== ownerUid) {
        return {}
      }

      const token = await user.getIdToken()

      return {
        Authorization: `Bearer ${token}`,
      }
    },
    on: {
      connecting: (isRetry?: boolean) => {
        if (isRetry) {
          pendingReconnect = true
        }

        setRealtimeConnectionState(isRetry ? 'reconnecting' : 'connecting')
      },
      connected: () => {
        setRealtimeConnectionState('connected')

        if (pendingReconnect) {
          pendingReconnect = false
          void notifyReconnectHandlers()
        }
      },
      closed: () => {
        if (!intentionalWsShutdown) {
          setRealtimeConnectionState('unavailable')
        } else {
          setRealtimeConnectionState('idle')
        }
      },
    },
  })
}

function getOrCreateWebSocketClient(): Client {
  const user = firebaseAuth.currentUser

  if (!user) {
    throw new Error('Cannot open WebSocket without authenticated user')
  }

  if (wsClient && wsClientOwnerUid === user.uid) {
    return wsClient
  }

  disposeWebSocketClient()

  wsClientOwnerUid = user.uid
  wsClient = createWebSocketClient(user.uid)

  return wsClient
}

const wsLink = new ApolloLink(operation => {
  const clientLink = new GraphQLWsLink(getOrCreateWebSocketClient())
  return clientLink.request(operation)
})

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)

    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    )
  },
  wsLink,
  from([errorLink, authRetryLink, authLink, httpLink]),
)

const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
})

export function registerSessionExpiredHandler(
  handler: SessionExpiredHandler,
): void {
  sessionExpiredHandler = handler
}

export function disposeWebSocketClient(): void {
  intentionalWsShutdown = true

  if (wsClient) {
    void wsClient.dispose()
    wsClient = null
    wsClientOwnerUid = null
  }

  setRealtimeConnectionState('idle')
}

export async function clearApolloCache(): Promise<void> {
  disposeWebSocketClient()
  await apolloClient.clearStore()
}

export default function useGraphQL() {
  return {
    apolloClient,
    disposeWebSocketClient,
  }
}
