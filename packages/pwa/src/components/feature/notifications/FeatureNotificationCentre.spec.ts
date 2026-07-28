/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

import FeatureNotificationCentre from '@/components/feature/notifications/FeatureNotificationCentre.vue'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const routerPush = vi.fn()
const loadNotifications = vi.fn()
const loadUnreadCount = vi.fn()
const markNotificationRead = vi.fn()
const markAllNotificationsRead = vi.fn()

const notifications = ref([
  {
    id: 'n-1',
    type: 'ORDER_STATUS_CHANGED',
    titleKey: null,
    bodyKey: null,
    title: 'Order updated',
    body: 'Your order was planned',
    read: false,
    createdAt: '2026-07-28T10:00:00.000Z',
    actionPath: '/apotheker/orders',
  },
  {
    id: 'n-2',
    type: 'ORDER_STATUS_CHANGED',
    titleKey: null,
    bodyKey: null,
    title: 'Older notice',
    body: 'Already seen',
    read: true,
    createdAt: '2026-07-27T10:00:00.000Z',
    actionPath: null,
  },
])

vi.mock('vue-router', async () => {
  const actual =
    await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({ push: routerPush }),
  }
})

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    notifications,
    loading: ref(false),
    refreshing: ref(false),
    errorMessage: ref(null),
    hasUnread: ref(true),
    unreadCount: ref(1),
    notificationCachedAt: ref(null),
    notificationRefreshError: ref(null),
    notificationsAreReadOnly: ref(false),
    loadNotifications,
    loadUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  }),
}))

vi.mock('@/utils/notification-display', () => ({
  resolveNotificationCopy: (notification: {
    title: string
    body: string
  }) => ({
    title: notification.title,
    body: notification.body,
  }),
}))

vi.mock('@/utils/notification-action-path', () => ({
  sanitizeInternalActionPath: (path: string | null) => path,
}))

const uiStubs = {
  CommonLoadingSkeleton: true,
  CommonEmptyState: {
    props: ['title', 'description'],
    template:
      '<div data-testid="empty"><p>{{ title }}</p><p>{{ description }}</p></div>',
  },
  CommonErrorState: {
    props: ['title', 'description'],
    template: '<div data-testid="error">{{ title }}</div>',
  },
  CommonPageHeader: {
    props: ['title', 'meta'],
    template:
      '<header data-testid="common-page-header"><h1>{{ title }}</h1><slot name="actions" /></header>',
  },
  CommonPageSection: {
    template: '<section><slot /></section>',
  },
  UButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: {
    props: ['title'],
    template: '<div data-testid="alert">{{ title }}</div>',
  },
}

describe('FeatureNotificationCentre', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    routerPush.mockReset()
    loadNotifications.mockReset()
    loadUnreadCount.mockReset()
    markNotificationRead.mockReset()
    markAllNotificationsRead.mockReset()
    markNotificationRead.mockResolvedValue(undefined)
    notifications.value = [
      {
        id: 'n-1',
        type: 'ORDER_STATUS_CHANGED',
        titleKey: null,
        bodyKey: null,
        title: 'Order updated',
        body: 'Your order was planned',
        read: false,
        createdAt: '2026-07-28T10:00:00.000Z',
        actionPath: '/apotheker/orders',
      },
      {
        id: 'n-2',
        type: 'ORDER_STATUS_CHANGED',
        titleKey: null,
        bodyKey: null,
        title: 'Older notice',
        body: 'Already seen',
        read: true,
        createdAt: '2026-07-27T10:00:00.000Z',
        actionPath: null,
      },
    ]
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('distinguishes unread and read rows with translated labels', async () => {
    const wrapper = mount(FeatureNotificationCentre, {
      props: {
        emptyDescriptionKey: 'apotheker.notifications.empty.description',
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="common-page-header"]').text()).toContain(
      translate('notifications.centre.title'),
    )
    expect(
      wrapper.find('[data-testid="notification-item-n-1"]').attributes('data-read'),
    ).toBe('false')
    expect(
      wrapper.find('[data-testid="notification-item-n-2"]').attributes('data-read'),
    ).toBe('true')
    expect(
      wrapper.find('[data-testid="notification-unread-dot"]').exists(),
    ).toBe(true)
    expect(wrapper.text()).toContain(translate('status.notification.unread'))
    expect(wrapper.text()).toContain(translate('status.notification.read'))
    expect(wrapper.text()).not.toContain('ORDER_STATUS_CHANGED')

    wrapper.unmount()
  })

  it('opens action path and marks notification read', async () => {
    const wrapper = mount(FeatureNotificationCentre, {
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    const openButton = wrapper
      .find('[data-testid="notification-item-n-1"]')
      .findAll('button')
      .find(button =>
        button.text().includes(translate('notifications.centre.openDetails')),
      )
    expect(openButton).toBeDefined()
    await openButton!.trigger('click')
    await flushPromises()

    expect(markNotificationRead).toHaveBeenCalledWith('n-1')
    expect(routerPush).toHaveBeenCalledWith('/apotheker/orders')

    wrapper.unmount()
  })

  it('shows empty state with role-specific description', async () => {
    notifications.value = []
    const wrapper = mount(FeatureNotificationCentre, {
      props: {
        emptyDescriptionKey: 'apotheker.notifications.empty.description',
      },
      global: { plugins: [createTestI18n('en')], stubs: uiStubs },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="empty"]').text()).toContain(
      translate('notifications.centre.empty.title'),
    )
    expect(wrapper.find('[data-testid="empty"]').text()).toContain(
      translate('apotheker.notifications.empty.description'),
    )

    wrapper.unmount()
  })
})
