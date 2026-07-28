/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { resolveOperationsFeedDetail } from '@/utils/operations-feed-display'

describe('operations feed display', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('builds NEW_ORDER detail from structured fields', () => {
    const detail = resolveOperationsFeedDetail({
      eventType: 'NEW_ORDER',
      message: 'raw-backend-dutch',
      order: { id: '507f1f77bcf86cd799439011', totalQuantity: 12 },
    })
    expect(detail).toBe(
      translate('admin.operationsFeed.newOrder', {
        orderId: '99439011',
        quantity: 12,
      }),
    )
    expect(detail).not.toContain('raw-backend-dutch')
  })

  it('falls back to generic copy for unknown events', () => {
    expect(
      resolveOperationsFeedDetail({
        eventType: 'OTHER',
        message: 'secret',
      }),
    ).toBe(translate('admin.operationsFeed.unknown'))
  })
})
