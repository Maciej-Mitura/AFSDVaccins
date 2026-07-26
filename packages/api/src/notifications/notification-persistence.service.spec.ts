import { MongoRepository } from 'typeorm'

import {
  LEGACY_NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
  NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
  NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX,
  NotificationPersistenceService,
} from './notification-persistence.service'
import { Notification } from './notification.entity'

describe('NotificationPersistenceService', () => {
  let service: NotificationPersistenceService
  let repository: jest.Mocked<
    Pick<
      MongoRepository<Notification>,
      | 'updateMany'
      | 'collectionIndexes'
      | 'dropCollectionIndex'
      | 'createCollectionIndex'
    >
  >

  beforeEach(() => {
    repository = {
      updateMany: jest.fn(),
      collectionIndexes: jest.fn(),
      dropCollectionIndex: jest.fn(),
      createCollectionIndex: jest.fn(),
    }

    service = new NotificationPersistenceService(
      repository as unknown as MongoRepository<Notification>,
    )
  })

  it('unsets null eventId values before creating the partial index', async () => {
    repository.updateMany.mockResolvedValue({ modifiedCount: 3 })
    repository.collectionIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
      {
        name: LEGACY_NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
        key: { recipientUserId: 1, eventId: 1 },
        unique: true,
      },
    ])

    await service.initializeNotificationPersistence()

    expect(repository.updateMany).toHaveBeenCalledWith(
      { eventId: { $type: 'null' } },
      { $unset: { eventId: '' } },
    )
    expect(repository.dropCollectionIndex).toHaveBeenCalledWith(
      LEGACY_NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
    )
    expect(repository.createCollectionIndex).toHaveBeenCalledWith(
      NOTIFICATION_RECIPIENT_EVENT_PARTIAL_INDEX.key,
      expect.objectContaining({
        name: NOTIFICATION_RECIPIENT_EVENT_INDEX_NAME,
        unique: true,
        partialFilterExpression: { eventId: { $type: 'string' } },
      }),
    )
  })

  it('backfills eventId from deduplicationKey when missing', async () => {
    repository.updateMany
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 2 })
    repository.collectionIndexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
    ])

    await service.initializeNotificationPersistence()

    expect(repository.updateMany).toHaveBeenNthCalledWith(
      2,
      {
        deduplicationKey: { $type: 'string' },
        $or: [
          { eventId: { $exists: false } },
          { eventId: { $type: 'null' } },
        ],
      },
      [{ $set: { eventId: '$deduplicationKey' } }],
    )
  })
})
