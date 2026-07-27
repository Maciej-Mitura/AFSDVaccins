import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../config/mongo-connection'
import { RouteTemplate } from './route-template.entity'

/**
 * Partial unique index: at most one active RouteTemplate per bezorgerProfileId.
 * Inactive / historical templates for the same courier are not indexed and remain allowed.
 */
export const ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME =
  'route_templates_active_bezorgerProfileId_unique'

export type MongoCollectionIndex = {
  name: string
  key: Record<string, number>
  unique?: boolean
  partialFilterExpression?: Record<string, unknown>
}

export const ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX = {
  key: { bezorgerProfileId: 1 },
  name: ROUTE_TEMPLATE_ACTIVE_OWNER_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    active: true,
  },
} as const

@Injectable()
export class RouteTemplatePersistenceService implements OnModuleInit {
  private readonly logger = new Logger(RouteTemplatePersistenceService.name)

  constructor(
    @InjectRepository(RouteTemplate)
    private readonly routeTemplateRepository: MongoRepository<RouteTemplate>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureActiveOwnerPartialUniqueIndex()
  }

  async ensureActiveOwnerPartialUniqueIndex(): Promise<void> {
    try {
      await this.routeTemplateRepository.createCollectionIndex(
        ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX.key,
        {
          name: ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX.name,
          unique: ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX.unique,
          partialFilterExpression:
            ROUTE_TEMPLATE_ACTIVE_OWNER_PARTIAL_INDEX.partialFilterExpression,
        },
      )
    } catch (error) {
      if (isMongoNamespaceNotFound(error)) {
        this.logger.log(
          'route_templates collection not present yet; active-owner index deferred',
        )
        return
      }

      if (isIndexAlreadyExistsError(error)) {
        return
      }

      if (isDuplicateKeyIndexBuildError(error)) {
        this.logger.error(
          'Cannot create active-owner unique index: duplicate active RouteTemplate rows exist for one or more couriers. Run npm run diagnose:route-template-assignments then repair:route-template-assignments.',
        )
        return
      }

      this.logger.warn(
        `Failed to ensure route template active-owner index: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      )
    }
  }

  async listCollectionIndexes(): Promise<MongoCollectionIndex[]> {
    try {
      return (await this.routeTemplateRepository.collectionIndexes()) as MongoCollectionIndex[]
    } catch (error) {
      if (isMongoNamespaceNotFound(error)) {
        return []
      }
      throw error
    }
  }
}

function isIndexAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: number }).code
  const codeName = (error as { codeName?: string }).codeName
  const message = error instanceof Error ? error.message : 'unknown'
  return (
    code === 85 ||
    code === 86 ||
    codeName === 'IndexOptionsConflict' ||
    codeName === 'IndexKeySpecsConflict' ||
    message.includes('already exists')
  )
}

/** Index build fails with duplicate key when conflicting active rows already exist. */
function isDuplicateKeyIndexBuildError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: number }).code
  const codeName = (error as { codeName?: string }).codeName
  return code === 11000 || codeName === 'DuplicateKey'
}
