/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import CommonPageSection from '@/components/common/CommonPageSection.vue'

describe('CommonPageSection', () => {
  it('renders title as h2 and description as supporting text', () => {
    const wrapper = mount(CommonPageSection, {
      props: {
        title: 'Filters',
        description: 'Narrow the result set',
      },
      slots: { default: '<p>Body</p>' },
    })

    expect(wrapper.findAll('h1')).toHaveLength(0)
    expect(wrapper.findAll('h2')).toHaveLength(1)
    expect(wrapper.get('h2').text()).toBe('Filters')
    expect(wrapper.text()).toContain('Narrow the result set')
    expect(wrapper.get('[data-testid="common-page-section-body"]').text()).toBe(
      'Body',
    )
  })

  it('default variant is borderless and uses spacing only', () => {
    const wrapper = mount(CommonPageSection, {
      props: { title: 'Results', variant: 'default' },
      slots: { default: '<div>Rows</div>' },
    })

    const root = wrapper.get('[data-testid="common-page-section"]')
    expect(root.attributes('data-variant')).toBe('default')
    expect(root.classes()).toContain('space-y-3')
    expect(root.classes().join(' ')).not.toMatch(
      /border|shadow|bg-muted|bg-elevated/,
    )
  })

  it('inset variant uses a muted surface without heavy elevation', () => {
    const wrapper = mount(CommonPageSection, {
      props: { title: 'Diagnostics', variant: 'inset' },
      slots: { default: '<div>Quiet</div>' },
    })

    const root = wrapper.get('[data-testid="common-page-section"]')
    expect(root.attributes('data-variant')).toBe('inset')
    expect(root.classes()).toEqual(
      expect.arrayContaining(['rounded-md', 'bg-muted', 'px-4', 'py-4']),
    )
    expect(root.classes().join(' ')).not.toMatch(/shadow|border/)
  })

  it('omits heading when title is absent and still renders the body', () => {
    const wrapper = mount(CommonPageSection, {
      slots: { default: '<span>Only body</span>' },
    })

    expect(wrapper.find('h2').exists()).toBe(false)
    expect(wrapper.get('[data-testid="common-page-section-body"]').text()).toBe(
      'Only body',
    )
  })

  it('renders an optional actions slot', () => {
    const wrapper = mount(CommonPageSection, {
      props: { title: 'Feed' },
      slots: {
        actions: '<button type="button">Refresh</button>',
        default: '<div />',
      },
    })

    expect(
      wrapper.get('[data-testid="common-page-section-actions"]').text(),
    ).toBe('Refresh')
  })
})
