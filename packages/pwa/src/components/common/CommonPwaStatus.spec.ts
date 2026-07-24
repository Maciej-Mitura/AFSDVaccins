/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import CommonPwaStatus from '@/components/common/CommonPwaStatus.vue'
import {
  __resetAppInstallForTests,
  __setCanInstallForTests,
} from '@/composables/useAppInstall'
import {
  __resetAppUpdateForTests,
  __setNeedRefreshForTests,
} from '@/composables/useAppUpdate'
import { __resetOnlineStatusForTests } from '@/composables/useOnlineStatus'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

vi.mock('@/composables/useGraphQL', () => ({
  triggerReconnectHandlers: vi.fn(() => Promise.resolve()),
}))

describe('CommonPwaStatus', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()
    __resetAppUpdateForTests()
    __resetAppInstallForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetAppUpdateForTests()
    __resetAppInstallForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  function mountStatus() {
    const i18n = createTestI18n('nl')
    return mount(CommonPwaStatus, {
      global: {
        plugins: [i18n],
        stubs: {
          UButton: {
            template: '<button><slot /></button>',
          },
        },
      },
    })
  }

  it('shows offline message when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const wrapper = mountStatus()
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-offline-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(translate('pwa.offline.message'))
    wrapper.unmount()
  })

  it('hides offline message when online', async () => {
    const wrapper = mountStatus()
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-offline-banner"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })

  it('shows restored-connection feedback after reconnect', async () => {
    const wrapper = mountStatus()

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    window.dispatchEvent(new Event('online'))
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-online-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(translate('pwa.online.restored'))
    wrapper.unmount()
  })

  it('exposes update action only when update is available', async () => {
    const wrapper = mountStatus()
    await nextTick()
    expect(wrapper.find('[data-testid="pwa-update-banner"]').exists()).toBe(
      false,
    )

    __setNeedRefreshForTests(true)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-update-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(translate('pwa.update.available'))
    expect(wrapper.text()).toContain(translate('pwa.update.apply'))
    wrapper.unmount()
  })

  it('exposes install action only when install prompt is available', async () => {
    const wrapper = mountStatus()
    await nextTick()
    expect(wrapper.find('[data-testid="pwa-install-banner"]').exists()).toBe(
      false,
    )

    __setCanInstallForTests(true)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-install-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(translate('pwa.install.action'))
    wrapper.unmount()
  })
})
