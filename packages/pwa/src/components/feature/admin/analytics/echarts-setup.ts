import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import type { ComposeOption } from 'echarts/core'
import { init as echartsInit, use as echartsUse } from 'echarts/core'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import type {
  BarSeriesOption,
  LineSeriesOption,
  PieSeriesOption,
} from 'echarts/charts'
import type {
  DatasetComponentOption,
  GraphicComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  TooltipComponentOption,
} from 'echarts/components'

echartsUse([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DatasetComponent,
  GraphicComponent,
  BarChart,
  LineChart,
  PieChart,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
])

export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
  | DatasetComponentOption
  | GraphicComponentOption
>

export { echartsInit }

/** Semantic chart palette aligned with Nuxt UI teal brand — restrained. */
export const CHART_COLORS = {
  primary: '#0d9488',
  secondary: '#0f766e',
  tertiary: '#14b8a6',
  muted: '#94a3b8',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#0284c7',
  surface: '#f8fafc',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  series: ['#0d9488', '#0284c7', '#d97706', '#7c3aed', '#64748b'] as const,
} as const

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function baseChartTextStyle() {
  return {
    color: CHART_COLORS.text,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  }
}

export function baseTooltip() {
  return {
    backgroundColor: '#ffffff',
    borderColor: CHART_COLORS.border,
    borderWidth: 1,
    textStyle: {
      color: CHART_COLORS.text,
      fontSize: 12,
    },
    extraCssText: 'box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);',
  }
}
