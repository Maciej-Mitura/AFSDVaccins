import {
  ConsoleLogger,
  INestApplication,
  Logger,
  ValidationPipe,
  type NestApplicationOptions,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NextFunction, Request, Response } from 'express'
import express from 'express'
import helmet from 'helmet'

import { assertBodyLimitWithinPolicy } from '../../config/body-limit'
import { EnvConfig } from '../../config/env.validation'

export type ApiBootstrapOptions = {
  /** When false, skip listen-only side effects (E2E uses init only). */
  enableListenLogging?: boolean
}

/**
 * NestFactory / TestingModule options shared by main.ts, E2E, and Playwright API.
 *
 * `bodyParser: false` disables Nest's built-in Express JSON/urlencoded parsers so
 * `configureApiApp` can register exactly one pair with `API_JSON_BODY_LIMIT`.
 */
export function createApiNestFactoryOptions(
  env: NodeJS.ProcessEnv = process.env,
): NestApplicationOptions {
  const isProduction = env.NODE_ENV === 'production'

  return {
    bodyParser: false,
    logger: new ConsoleLogger({
      prefix: 'VaccinDelivery',
      logLevels: isProduction
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'debug', 'verbose', 'log'],
    }),
  }
}

/**
 * Applies Helmet, the authoritative body parsers, CORS, validation, and shutdown hooks.
 *
 * Interaction with NestFactory:
 * 1. `createApiNestFactoryOptions()` sets `bodyParser: false` (no Nest default parsers).
 * 2. This function registers exactly one `express.json` + `express.urlencoded` pair
 *    using `API_JSON_BODY_LIMIT` (same string passed to Express `limit`).
 * 3. No early Content-Length gate — the parsers enforce size for Content-Length and
 *    chunked Transfer-Encoding alike.
 */
export function configureApiApp(
  app: INestApplication,
  options: ApiBootstrapOptions = {},
): void {
  const configService = app.get(ConfigService<EnvConfig, true>)
  const nodeEnv = configService.get('NODE_ENV', { infer: true })
  const isProduction = nodeEnv === 'production'
  const frontendUrl = configService.get('URL_FRONTEND', { infer: true })
  const jsonBodyLimit = configService.get('API_JSON_BODY_LIMIT', { infer: true })
  // Fail fast if config somehow bypassed Joi (defense in depth).
  assertBodyLimitWithinPolicy(jsonBodyLimit)

  // Helmet before routes (Express middleware order).
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? undefined
        : {
            directives: {
              ...helmet.contentSecurityPolicy.getDefaultDirectives(),
              'script-src': [
                "'self'",
                "'unsafe-inline'",
                'https://apollo-server-landing-page.cdn.apollographql.com',
              ],
              'img-src': [
                "'self'",
                'data:',
                'https://apollo-server-landing-page.cdn.apollographql.com',
              ],
              'style-src': [
                "'self'",
                "'unsafe-inline'",
                'https://apollo-server-landing-page.cdn.apollographql.com',
              ],
              'frame-src': ["'self'", 'https://sandbox.embed.apollographql.com'],
              'manifest-src': [
                "'self'",
                'https://apollo-server-landing-page.cdn.apollographql.com',
              ],
              'connect-src': [
                "'self'",
                'https://apollo-server-landing-page.cdn.apollographql.com',
              ],
            },
          },
      crossOriginEmbedderPolicy: isProduction,
    }),
  )

  // Authoritative body size limit (Content-Length and chunked bodies).
  app.use(express.json({ limit: jsonBodyLimit }))
  app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }))

  // Normalize parser failures before Nest's generic error path (no stack leakage).
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      next: NextFunction,
    ): void => {
      if (isEntityTooLargeError(err)) {
        res.status(413).json({
          statusCode: 413,
          message: 'Request entity too large',
        })
        return
      }

      if (isMalformedJsonError(err)) {
        res.status(400).json({
          statusCode: 400,
          message: 'Malformed JSON',
        })
        return
      }

      next(err)
    },
  )

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.enableShutdownHooks()

  if (options.enableListenLogging !== false) {
    Logger.log(
      `API security bootstrap: Helmet=on bodyLimit=${jsonBodyLimit} (express parsers) graphiql=${
        isProduction ? 'off' : 'on'
      }`,
    )
  }
}

function isEntityTooLargeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const candidate = err as {
    type?: string
    status?: number
    statusCode?: number
  }
  return (
    candidate.type === 'entity.too.large' ||
    candidate.status === 413 ||
    candidate.statusCode === 413
  )
}

function isMalformedJsonError(err: unknown): boolean {
  if (!(err instanceof SyntaxError)) {
    return false
  }
  const candidate = err as SyntaxError & { type?: string; status?: number }
  return (
    candidate.type === 'entity.parse.failed' ||
    candidate.status === 400 ||
    'body' in candidate
  )
}
