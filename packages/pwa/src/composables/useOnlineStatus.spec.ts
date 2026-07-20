/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import {
  __areOnlineListenersAttachedForTests,
  __resetOnlineStatusForTests,
  useOnlineStatus,
} from './useOnlineStatus'

vi.mock('@/composables/useGraphQL', () => ({
  triggerReconnectHandlers: vi.fn(() => Promise.resolve()),
}))

function mountOnlineConsumer() {
  const Host = defineComponent({
    setup() {
      return useOnlineStatus()
    },
    template: '<div />',
  })

  return mount(Host)
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    vi.clearAllMocks()
  })

  it('initializes from navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const wrapper = mountOnlineConsumer()
    expect(wrapper.vm.isOnline).toBe(false)
    wrapper.unmount()
  })

  it('reacts to offline event', async () => {
    const wrapper = mountOnlineConsumer()
    expect(wrapper.vm.isOnline).toBe(true)

    window.dispatchEvent(new Event('offline'))
    await nextTick()

    expect(wrapper.vm.isOnline).toBe(false)
    wrapper.unmount()
  })

  it('reacts to online event and records reconnect timestamp', async () => {
    const wrapper = mountOnlineConsumer()

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(wrapper.vm.isOnline).toBe(false)

    window.dispatchEvent(new Event('online'))
    await nextTick()

    expect(wrapper.vm.isOnline).toBe(true)
    expect(wrapper.vm.lastReconnectedAt).toEqual(expect.any(Number))
    wrapper.unmount()
  })

  it('cleans up listeners on reset', () => {
    const wrapper = mountOnlineConsumer()
    expect(__areOnlineListenersAttachedForTests()).toBe(true)

    wrapper.unmount()
    __resetOnlineStatusForTests()

    expect(__areOnlineListenersAttachedForTests()).toBe(false)
  })

  it('does not register duplicate listeners when called multiple times', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')

    const first = mountOnlineConsumer()
    const second = mountOnlineConsumer()

    const onlineCalls = addSpy.mock.calls.filter(
      ([type]) => type === 'online',
    ).length
    const offlineCalls = addSpy.mock.calls.filter(
      ([type]) => type === 'offline',
    ).length

    expect(onlineCalls).toBe(1)
    expect(offlineCalls).toBe(1)

    first.unmount()
    second.unmount()
    addSpy.mockRestore()
  })
})
