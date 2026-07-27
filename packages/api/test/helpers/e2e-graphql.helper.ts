import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import request from 'supertest'

export type GraphqlErrorBody = {
  message: string
  extensions?: {
    code?: string
    originalError?: {
      message?: string | string[] | { message?: string; error?: string }
      error?: string
      statusCode?: number
    }
    [key: string]: unknown
  }
}

export type GraphqlResponse<TData> = {
  httpStatus: number
  data: TData | null | undefined
  errors: GraphqlErrorBody[] | undefined
  body: {
    data?: TData | null
    errors?: GraphqlErrorBody[]
  }
}

export type GraphqlRequestOptions = {
  query: string
  variables?: Record<string, unknown>
  token?: string
}

/**
 * Focused GraphQL HTTP helper for Nest + Apollo E2E (supertest).
 */
export async function graphqlRequest<TData = unknown>(
  app: INestApplication,
  options: GraphqlRequestOptions,
): Promise<GraphqlResponse<TData>> {
  const server = app.getHttpServer() as Server
  const req = request(server).post('/graphql').send({
    query: options.query,
    variables: options.variables ?? {},
  })

  if (options.token) {
    void req.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await req
  const body = response.body as {
    data?: TData | null
    errors?: GraphqlErrorBody[]
  }

  return {
    httpStatus: response.status,
    data: body.data,
    errors: body.errors,
    body,
  }
}

export function firstErrorCode(
  errors: GraphqlErrorBody[] | undefined,
): string | undefined {
  const extensions = errors?.[0]?.extensions
  if (!extensions) {
    return undefined
  }

  const original = extensions.originalError
  if (original && typeof original === 'object') {
    if (typeof original.error === 'string') {
      return original.error
    }

    const message = original.message
    if (
      message &&
      typeof message === 'object' &&
      !Array.isArray(message) &&
      typeof message.error === 'string'
    ) {
      return message.error
    }
  }

  if (
    typeof extensions.code === 'string' &&
    extensions.code !== 'INTERNAL_SERVER_ERROR' &&
    extensions.code !== 'GRAPHQL_VALIDATION_FAILED'
  ) {
    return extensions.code
  }

  if (typeof extensions.code === 'string') {
    return extensions.code
  }

  return undefined
}

export function firstErrorMessage(
  errors: GraphqlErrorBody[] | undefined,
): string | undefined {
  return errors?.[0]?.message
}
