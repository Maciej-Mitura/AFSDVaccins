/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

const dispose = vi.fn()
const resize = vi.fn()
const setOption = vi.fn()
const on = vi.fn()

vi.mock('@/components/feature/admin/analytics/echarts-setup', () => ({
  echartsInit: vi.fn(() => ({
    setOption,
    dispose,
    resize,
    on,
  })),
  prefersReducedMotion: () => false,
  CHART_COLORS: {
    primary: '#0d9488',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
  },
  baseChartTextStyle: () => ({}),
  baseTooltip: () => ({}),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

import CommonEcharts from '@/components/feature/admin/analytics/CommonEcharts.vue'

describe('CommonEcharts', () => {
  it('shows empty state without initialising a chart', () => {
    const wrapper = mount(CommonEcharts, {
      props: {
        empty: true,
        emptyTitle: 'No data',
        emptyDescription: 'Nothing here',
        option: null,
      },
      global: {
        stubs: {
          CommonEmptyState: {
            template: '<div data-testid="empty">{{ title }}</div>',
            props: ['title', 'description'],
          },
          CommonLoadingSkeleton: true,
        },
      },
    })
    expect(wrapper.find('[data-testid="empty"]').exists()).toBe(true)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('initialises chart, updates option, and disposes on unmount', async () => {
    const wrapper = mount(CommonEcharts, {
      props: {
        option: {
          series: [{ type: 'bar', data: [1, 2] }],
        },
        title: 'Scores',
        minHeight: 200,
      },
      global: {
        stubs: {
          CommonEmptyState: true,
          CommonLoadingSkeleton: true,
        },
      },
    })
    await nextTick()
    expect(setOption).toHaveBeenCalled()
    wrapper.unmount()
    expect(dispose).toHaveBeenCalled()
  })

  it('exposes resize helper', async () => {
    const wrapper = mount(CommonEcharts, {
      props: {
        option: { series: [{ type: 'bar', data: [3] }] },
      },
      global: {
        stubs: {
          CommonEmptyState: true,
          CommonLoadingSkeleton: true,
        },
      },
    })
    await nextTick()
    ;(wrapper.vm as { resize: () => void }).resize()
    expect(resize).toHaveBeenCalled()
  })
})
