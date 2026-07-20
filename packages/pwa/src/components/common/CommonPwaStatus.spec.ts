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
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetAppUpdateForTests()
    __resetAppInstallForTests()
  })

  it('shows offline message when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const wrapper = mount(CommonPwaStatus)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-offline-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain(
      'Je bent offline. Live gegevens en acties zijn tijdelijk niet beschikbaar.',
    )
    wrapper.unmount()
  })

  it('hides offline message when online', async () => {
    const wrapper = mount(CommonPwaStatus)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-offline-banner"]').exists()).toBe(
      false,
    )
    wrapper.unmount()
  })

  it('shows restored-connection feedback after reconnect', async () => {
    const wrapper = mount(CommonPwaStatus)

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    window.dispatchEvent(new Event('online'))
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-online-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Verbinding hersteld')
    wrapper.unmount()
  })

  it('exposes update action only when update is available', async () => {
    const wrapper = mount(CommonPwaStatus)
    await nextTick()
    expect(wrapper.find('[data-testid="pwa-update-banner"]').exists()).toBe(
      false,
    )

    __setNeedRefreshForTests(true)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-update-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('Er is een nieuwe versie beschikbaar.')
    expect(wrapper.text()).toContain('Bijwerken')
    wrapper.unmount()
  })

  it('exposes install action only when install prompt is available', async () => {
    const wrapper = mount(CommonPwaStatus)
    await nextTick()
    expect(wrapper.find('[data-testid="pwa-install-banner"]').exists()).toBe(
      false,
    )

    __setCanInstallForTests(true)
    await nextTick()

    expect(wrapper.find('[data-testid="pwa-install-banner"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('App installeren')
    wrapper.unmount()
  })
})
