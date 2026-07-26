import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MongoRepository } from 'typeorm'

import { isMongoNamespaceNotFound } from '../config/mongo-connection'
import { Notification } from './notification.entity'

export const NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME =
  'notifications_recipient_eventId_string_unique'

/** Legacy TypeORM-generated unique index that incorrectly indexes null eventId. */
export const LEGACY_NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME =
  'UQ_notifications_recipient_event'

export type MongoCollectionIndex = {
  name: string
  key: Record<string, number>
  unique?: boolean
  partialFilterExpression?: Record<string, unknown>
}

export const NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX = {
  key: { recipientUserId: 1, eventId: 1 },
  name: NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
  unique: true,
  partialFilterExpression: {
    eventId: { $type: 'string' },
  },
} as const

export type MongoUpdateManyResult = {
  modifiedCount?: number
}

function readModifiedCount(result: unknown): number {
  if (
    typeof result === 'object' &&
    result !== null &&
    'modifiedCount' in result &&
    typeof (result as MongoUpdateManyResult).modifiedCount === 'number'
  ) {
    return (result as MongoUpdateManyResult).modifiedCount ?? 0
  }

  return 0
}

/**
 * Ensures a partial unique index on (recipientUserId, eventId) that only covers
 * string eventIds. TypeORM sparse unique compound indexes still index explicit
 * nulls, which breaks startup against legacy notification rows.
 */
@Injectable()
export class NotificationPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(NotificationPersistenceService.name)

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: MongoRepository<Notification>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeNotificationPersistence()
  }

  async initializeNotificationPersistence(): Promise<void> {
    const unsetEventIdCount = await this.repairLegacyNullEventIds()
    const unsetDedupCount = await this.repairLegacyNullDeduplicationKeys()
    const backfilled = await this.backfillEventIdFromDeduplicationKey()
    await this.ensurePartialUniqueRecipientEventIndex()

    if (unsetEventIdCount > 0) {
      this.logger.log(
        `Unset null eventId on ${unsetEventIdCount} notification record(s)`,
      )
    }

    if (unsetDedupCount > 0) {
      this.logger.log(
        `Unset null deduplicationKey on ${unsetDedupCount} notification record(s)`,
      )
    }

    if (backfilled > 0) {
      this.logger.log(
        `Backfilled eventId from deduplicationKey on ${backfilled} notification record(s)`,
      )
    }
  }

  async repairLegacyNullEventIds(): Promise<number> {
    const result = await this.notificationRepository.updateMany(
      { eventId: { $type: 'null' } },
      { $unset: { eventId: '' } },
    )

    return readModifiedCount(result)
  }

  /**
   * Explicit null deduplicationKey breaks TypeORM’s sparse unique index on
   * synchronize (Mongo indexes null; only absent fields are skipped).
   */
  async repairLegacyNullDeduplicationKeys(): Promise<number> {
    const result = await this.notificationRepository.updateMany(
      { deduplicationKey: { $type: 'null' } },
      { $unset: { deduplicationKey: '' } },
    )

    return readModifiedCount(result)
  }

  /**
   * Copies string deduplicationKey → eventId when eventId is absent,
   * so legacy rows participate in the Phase 27A uniqueness contract.
   */
  async backfillEventIdFromDeduplicationKey(): Promise<number> {
    // Aggregation pipeline update (MongoDB 4.2+): copy field without loading docs.
    const result = await this.notificationRepository.updateMany(
      {
        deduplicationKey: { $type: 'string' },
        $or: [
          { eventId: { $exists: false } },
          { eventId: { $type: 'null' } },
        ],
      },
      [{ $set: { eventId: '$deduplicationKey' } }],
    )

    return readModifiedCount(result)
  }

  async dropLegacyRecipientEventIndexes(): Promise<void> {
    let indexes: MongoCollectionIndex[]

    try {
      indexes =
        (await this.notificationRepository.collectionIndexes()) as MongoCollectionIndex[]
    } catch (error) {
      if (isMongoNamespaceNotFound(error)) {
        this.logger.log(
          'notifications collection not present yet; skipping legacy index inspection',
        )
        return
      }
      throw error
    }

    for (const index of indexes) {
      if (index.name === '_id_') {
        continue
      }

      if (index.name === NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME) {
        continue
      }

      const keys = index.key ?? {}
      const isRecipientEventCompound =
        Object.prototype.hasOwnProperty.call(keys, 'recipientUserId') &&
        Object.prototype.hasOwnProperty.call(keys, 'eventId') &&
        Object.keys(keys).length === 2

      if (
        index.name === LEGACY_NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME ||
        isRecipientEventCompound
      ) {
        await this.notificationRepository.dropCollectionIndex(index.name)
        this.logger.log(`Dropped legacy notifications index ${index.name}`)
      }
    }
  }

  async ensurePartialUniqueRecipientEventIndex(): Promise<void> {
    await this.dropLegacyRecipientEventIndexes()

    await this.notificationRepository.createCollectionIndex(
      NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX.key,
      {
        name: NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX.name,
        unique: NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX.unique,
        partialFilterExpression:
          NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX.partialFilterExpression,
      },
    )
  }
}
