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

/**
 * Static brand / series palette (teal aligned with PWA theme_color).
 * Text, border, and tooltip colours resolve from Nuxt UI CSS variables at
 * option-build time so charts follow light/dark mode.
 */
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
  textMuted: '#475569',
  border: '#e2e8f0',
  series: ['#0d9488', '#0284c7', '#d97706', '#7c3aed', '#64748b'] as const,
} as const

export type ChartThemeColors = {
  primary: string
  secondary: string
  tertiary: string
  muted: string
  warning: string
  danger: string
  info: string
  surface: string
  text: string
  textMuted: string
  border: string
  tooltipBg: string
  series: readonly string[]
}

function readCssColor(variableName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim()
  return value || fallback
}

/** Resolve chart chrome colours from Nuxt UI semantic CSS variables. */
export function resolveChartThemeColors(): ChartThemeColors {
  return {
    // Keep series/brand fills on the established teal chart palette.
    primary: CHART_COLORS.primary,
    secondary: CHART_COLORS.secondary,
    tertiary: CHART_COLORS.tertiary,
    muted: CHART_COLORS.muted,
    warning: CHART_COLORS.warning,
    danger: CHART_COLORS.danger,
    info: CHART_COLORS.info,
    surface: readCssColor('--ui-bg-elevated', CHART_COLORS.surface),
    // Prefer highlighted / toned over muted for WCAG-friendly chart labels.
    text: readCssColor('--ui-text-highlighted', CHART_COLORS.text),
    textMuted: readCssColor('--ui-text-toned', CHART_COLORS.textMuted),
    border: readCssColor('--ui-border', CHART_COLORS.border),
    tooltipBg: readCssColor('--ui-bg', '#ffffff'),
    series: CHART_COLORS.series,
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function baseChartTextStyle(colors: ChartThemeColors = resolveChartThemeColors()) {
  return {
    color: colors.text,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  }
}

export function baseTooltip(colors: ChartThemeColors = resolveChartThemeColors()) {
  return {
    backgroundColor: colors.tooltipBg,
    borderColor: colors.border,
    borderWidth: 1,
    textStyle: {
      color: colors.text,
      fontSize: 12,
    },
    extraCssText: 'box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);',
  }
}
