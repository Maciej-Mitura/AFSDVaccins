/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import CommonPageHeader from '@/components/common/CommonPageHeader.vue'

describe('CommonPageHeader', () => {
  it('renders a single page-level h1 with title', () => {
    const wrapper = mount(CommonPageHeader, {
      props: { title: 'Order history' },
    })

    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.text()).toBe('Order history')
    expect(wrapper.find('h2').exists()).toBe(false)
  })

  it('renders optional subtitle as supporting text, not a heading', () => {
    const wrapper = mount(CommonPageHeader, {
      props: {
        title: 'History',
        subtitle: 'Completed and cancelled orders',
      },
    })

    expect(wrapper.text()).toContain('Completed and cancelled orders')
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.findAll('h2')).toHaveLength(0)
    expect(wrapper.findAll('h3')).toHaveLength(0)
  })

  it('renders optional meta and actions slot without card chrome', () => {
    const wrapper = mount(CommonPageHeader, {
      props: {
        title: 'History',
        meta: '42 results',
      },
      slots: {
        actions: '<button type="button">Export</button>',
      },
    })

    expect(wrapper.get('[data-testid="common-page-header-meta"]').text()).toBe(
      '42 results',
    )
    expect(
      wrapper.get('[data-testid="common-page-header-actions"]').text(),
    ).toBe('Export')

    const root = wrapper.get('[data-testid="common-page-header"]')
    expect(root.classes().join(' ')).not.toMatch(/border|shadow|ring/)
    expect(root.element.tagName).toBe('HEADER')
  })

  it('stacks title and actions responsively via flex utilities', () => {
    const wrapper = mount(CommonPageHeader, {
      props: { title: 'Dashboard' },
      slots: { actions: '<button type="button">Go</button>' },
    })

    const layout = wrapper.get('[data-testid="common-page-header"] > div')
    expect(layout.classes()).toEqual(
      expect.arrayContaining([
        'flex',
        'flex-col',
        'sm:flex-row',
        'sm:items-start',
        'sm:justify-between',
      ]),
    )
  })
})
