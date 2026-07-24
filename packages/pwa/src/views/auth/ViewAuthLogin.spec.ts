/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ViewAuthLogin from '@/views/auth/ViewAuthLogin.vue'
import { LOGIN_OFFLINE_MESSAGE } from '@/views/auth/login-offline'
import { __resetOnlineStatusForTests } from '@/composables/useOnlineStatus'

const loginMock = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  triggerReconnectHandlers: vi.fn(() => Promise.resolve()),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
}))

vi.mock('@/composables/useFirebase', () => ({
  useFirebase: () => ({
    login: loginMock,
  }),
}))

vi.mock('@/composables/useCurrentUser', () => ({
  useCurrentUser: () => ({
    loadCurrentUser: vi.fn(),
    getDefaultRouteForRole: () => '/apotheker',
    role: { value: null },
    needsProfileCompletion: { value: false },
  }),
}))

import { createTestI18n } from '@/i18n/test-utils'
import { __resetAppI18nForTests } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'

describe('ViewAuthLogin offline UX', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    loginMock.mockReset()
  })

  afterEach(() => {
    __resetOnlineStatusForTests()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  function mountLogin() {
    const i18n = createTestI18n('nl')
    return mount(ViewAuthLogin, {
      global: {
        plugins: [i18n],
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
          UCard: { template: '<div><slot name="header" /><slot /></div>' },
          UAlert: {
            props: ['title'],
            template: '<div data-testid="alert">{{ title }}<slot /></div>',
          },
          UForm: {
            template:
              "<form @submit.prevent=\"$emit('submit', { data: { email: 'a@b.c', password: 'password1' } })\"><slot /></form>",
          },
          UFormField: { template: '<div><slot /></div>' },
          UInput: {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template:
              '<input :value="modelValue" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
          },
          UButton: {
            props: ['disabled'],
            template:
              '<button data-testid="login-submit" :disabled="disabled"><slot /></button>',
          },
        },
      },
    })
  }

  it('shows offline explanation and disables submit while offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const wrapper = mountLogin()

    await nextTick()

    expect(wrapper.text()).toContain(LOGIN_OFFLINE_MESSAGE)
    expect(
      wrapper.find('[data-testid="login-submit"]').attributes('disabled'),
    ).toBeDefined()

    await wrapper.find('form').trigger('submit')
    await nextTick()

    expect(loginMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('re-enables submit when connectivity returns and keeps email', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    __resetOnlineStatusForTests()

    const wrapper = mountLogin()

    const emailInput = wrapper.findAll('input')[0]
    await emailInput.setValue('apotheker@example.com')
    expect((emailInput.element as HTMLInputElement).value).toBe(
      'apotheker@example.com',
    )

    expect(
      wrapper.find('[data-testid="login-submit"]').attributes('disabled'),
    ).toBeDefined()

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
    await nextTick()

    expect(
      wrapper.find('[data-testid="login-submit"]').attributes('disabled'),
    ).toBeUndefined()
    expect((emailInput.element as HTMLInputElement).value).toBe(
      'apotheker@example.com',
    )
    expect(wrapper.text()).not.toContain(LOGIN_OFFLINE_MESSAGE)

    wrapper.unmount()
  })
})
