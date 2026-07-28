/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  baseTooltip,
  CHART_COLORS,
  resolveChartThemeColors,
} from '@/components/feature/admin/analytics/echarts-setup'

describe('echarts theme colour resolution', () => {
  afterEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('falls back to readable static palette when CSS variables are unset', () => {
    const colors = resolveChartThemeColors()
    expect(colors.text).toBe(CHART_COLORS.text)
    expect(colors.textMuted).toBe(CHART_COLORS.textMuted)
    expect(colors.border).toBe(CHART_COLORS.border)
    expect(colors.primary).toBe(CHART_COLORS.primary)
    expect(colors.tooltipBg).toBe('#ffffff')
  })

  it('reads Nuxt UI semantic CSS variables when present', () => {
    document.documentElement.style.setProperty(
      '--ui-text-highlighted',
      '#f8fafc',
    )
    document.documentElement.style.setProperty('--ui-text-toned', '#cbd5e1')
    document.documentElement.style.setProperty('--ui-border', '#334155')
    document.documentElement.style.setProperty('--ui-bg', '#0f172a')

    const colors = resolveChartThemeColors()
    expect(colors.text).toBe('#f8fafc')
    expect(colors.textMuted).toBe('#cbd5e1')
    expect(colors.border).toBe('#334155')
    expect(colors.tooltipBg).toBe('#0f172a')

    const tooltip = baseTooltip(colors)
    expect(tooltip.backgroundColor).toBe('#0f172a')
    expect(tooltip.textStyle.color).toBe('#f8fafc')
  })

  it('keeps axis label fallback darker than previous slate-500 muted', () => {
    // #475569 (slate-600) improves contrast vs #64748b (slate-500) on white.
    expect(CHART_COLORS.textMuted.toLowerCase()).toBe('#475569')
  })
})
