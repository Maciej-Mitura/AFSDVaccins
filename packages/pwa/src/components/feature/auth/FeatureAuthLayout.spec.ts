/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('vue-router', () => ({
  RouterView: { template: '<div data-testid="auth-router-view" />' },
}))

import FeatureAuthLayout from '@/components/feature/auth/FeatureAuthLayout.vue'

describe('FeatureAuthLayout contrast surface', () => {
  it('uses theme-adaptive page chrome instead of light-only primary-50', () => {
    const wrapper = mount(FeatureAuthLayout, {
      global: {
        stubs: {
          CommonLanguageSelector: true,
          RouterView: { template: '<div data-testid="auth-router-view" />' },
        },
      },
    })

    const root = wrapper.get('div')
    expect(root.classes()).toContain('bg-muted')
    expect(root.classes().join(' ')).not.toMatch(/primary-50/)

    const title = wrapper.get('h1')
    expect(title.classes()).toContain('text-highlighted')
    expect(wrapper.get('p').classes()).toContain('text-toned')
  })
})
