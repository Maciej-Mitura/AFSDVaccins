import type { EChartsOption } from '@/components/feature/admin/analytics/echarts-setup'
import {
  baseChartTextStyle,
  baseTooltip,
  resolveChartThemeColors,
  prefersReducedMotion,
} from '@/components/feature/admin/analytics/echarts-setup'
import type {
  ComponentMatrixRow,
  DistributionSlice,
  HandlingBarItem,
  MonthlyActivityVm,
  ScoreBarItem,
} from '@/composables/courier-analytics-mappers'
import { formatHandlingDuration } from '@/composables/courier-analytics-mappers'

type Translate = (key: string, params?: Record<string, unknown>) => string

function animationFlag(): boolean {
  return !prefersReducedMotion()
}

export function buildScoreComparisonOption(
  items: ScoreBarItem[],
  t: Translate,
): EChartsOption {
  const colors = resolveChartThemeColors()
  const names = items.map(i => i.displayName)
  const values = items.map(i => ({
    value: i.totalScore,
    courierProfileId: i.courierProfileId,
    itemStyle: {
      color: i.insufficient ? colors.muted : colors.primary,
    },
  }))

  return {
    animation: animationFlag(),
    textStyle: baseChartTextStyle(colors),
    tooltip: {
      ...baseTooltip(colors),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as {
          name?: string
          value?: number
          data?: { courierProfileId?: string }
        }
        const item = items.find(
          i => i.courierProfileId === first.data?.courierProfileId,
        )
        const score =
          typeof first.value === 'number' ? first.value.toFixed(2) : '—'
        const insuff = item?.insufficient
          ? `<br/>${t('admin.courierAnalytics.insufficientData')}`
          : ''
        return `${first.name ?? ''}<br/>${t('admin.courierAnalytics.reliabilityScore')}: <b>${score}</b>${insuff}`
      },
    },
    grid: { left: 120, right: 24, top: 8, bottom: 32, containLabel: false },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: colors.textMuted },
      splitLine: { lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLabel: {
        color: colors.text,
        width: 100,
        overflow: 'truncate',
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 22,
        label: {
          show: true,
          position: 'right',
          formatter: (p: unknown) => {
            const value = (p as { value?: unknown }).value
            return typeof value === 'number' ? value.toFixed(1) : ''
          },
          color: colors.textMuted,
          fontSize: 11,
        },
      },
    ],
  }
}

export function buildComponentMatrixOption(
  rows: ComponentMatrixRow[],
  t: Translate,
): EChartsOption {
  const colors = resolveChartThemeColors()
  const categories = [
    t('admin.courierAnalytics.component.routeCompletion'),
    t('admin.courierAnalytics.component.deliveryCompletion'),
    t('admin.courierAnalytics.component.onTime'),
    t('admin.courierAnalytics.component.qrConfirmation'),
    t('admin.courierAnalytics.component.consistency'),
  ]
  const names = rows.map(r => r.displayName)
  const keys = [
    'routeCompletion',
    'deliveryCompletion',
    'onTime',
    'qrConfirmation',
    'operationalConsistency',
  ] as const

  const series = keys.map((key, index) => ({
    name: categories[index],
    type: 'bar' as const,
    data: rows.map(row => ({
      value: row.scores[key],
      courierProfileId: row.courierProfileId,
      weighted: row.weighted[key],
      component: key,
    })),
    barMaxWidth: 14,
    itemStyle: {
      color: colors.series[index % colors.series.length],
    },
  }))

  return {
    animation: animationFlag(),
    textStyle: baseChartTextStyle(colors),
    legend: {
      bottom: 0,
      textStyle: { color: colors.textMuted, fontSize: 11 },
    },
    tooltip: {
      ...baseTooltip(colors),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{
          seriesName?: string
          value?: number
          data?: { weighted?: number }
          marker?: string
        }>
        if (list.length === 0) return ''
        const header = rows.find(
          r =>
            r.courierProfileId ===
            (list[0] as { data?: { courierProfileId?: string } }).data
              ?.courierProfileId,
        )
        const lines = list.map(item => {
          const score =
            typeof item.value === 'number' ? item.value.toFixed(1) : '—'
          const weighted =
            typeof item.data?.weighted === 'number'
              ? item.data.weighted.toFixed(2)
              : '—'
          return `${item.marker ?? ''}${item.seriesName}: ${score} (${t('admin.courierAnalytics.weightedContribution')}: ${weighted})`
        })
        return `${header?.displayName ?? ''}<br/>${lines.join('<br/>')}`
      },
    },
    grid: {
      left: 120,
      right: 16,
      top: 8,
      bottom: 48,
      containLabel: false,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: colors.textMuted },
      splitLine: { lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLabel: {
        color: colors.text,
        width: 100,
        overflow: 'truncate',
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series,
  }
}

export function buildMonthlyActivityOption(
  months: MonthlyActivityVm[],
  t: Translate,
): EChartsOption {
  const colors = resolveChartThemeColors()
  return {
    animation: animationFlag(),
    textStyle: baseChartTextStyle(colors),
    legend: {
      bottom: 0,
      textStyle: { color: colors.textMuted, fontSize: 11 },
    },
    tooltip: {
      ...baseTooltip(colors),
      trigger: 'axis',
    },
    grid: {
      left: 48,
      right: 16,
      top: 16,
      bottom: 48,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: months.map(m => m.month),
      axisLabel: {
        color: colors.textMuted,
        rotate: months.length > 8 ? 30 : 0,
      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: colors.textMuted },
      splitLine: { lineStyle: { color: colors.border } },
    },
    series: [
      {
        name: t('admin.courierAnalytics.series.deliveredStops'),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.12 },
        data: months.map(m => m.deliveredStops),
        itemStyle: { color: colors.primary },
        lineStyle: { color: colors.primary, width: 2 },
      },
      {
        name: t('admin.courierAnalytics.series.completedRoutes'),
        type: 'line',
        smooth: true,
        data: months.map(m => m.completedRoutes),
        itemStyle: { color: colors.info },
        lineStyle: { color: colors.info, width: 2 },
      },
      {
        name: t('admin.courierAnalytics.series.deliveredOrders'),
        type: 'line',
        smooth: true,
        data: months.map(m => m.deliveredOrders),
        itemStyle: { color: colors.warning },
        lineStyle: { color: colors.warning, width: 2 },
      },
    ],
  }
}

export function buildDonutOption(
  slices: DistributionSlice[],
  labelForKey: (key: string) => string,
  t: Translate,
): EChartsOption {
  const colors = resolveChartThemeColors()
  const total = slices.reduce((sum, s) => sum + s.count, 0)
  return {
    animation: animationFlag(),
    textStyle: baseChartTextStyle(colors),
    tooltip: {
      ...baseTooltip(colors),
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as {
          name?: string
          value?: number
          percent?: number
        }
        return `${p.name}<br/>${t('admin.courierAnalytics.count')}: <b>${p.value}</b> (${(p.percent ?? 0).toFixed(1)}%)`
      },
    },
    legend: {
      orient: 'horizontal',
      bottom: 0,
      textStyle: { color: colors.textMuted, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data: slices.map((slice, index) => ({
          name: labelForKey(slice.key),
          value: slice.count,
          itemStyle: {
            color: colors.series[index % colors.series.length],
          },
        })),
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '40%',
        style: {
          text: String(total),
          fill: colors.text,
          fontSize: 20,
          fontWeight: 600,
          align: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '52%',
        style: {
          text: t('admin.courierAnalytics.total'),
          fill: colors.textMuted,
          fontSize: 11,
          align: 'center',
        },
      },
    ],
  }
}

export function buildHandlingDurationOption(
  items: HandlingBarItem[],
  t: Translate,
): EChartsOption {
  const colors = resolveChartThemeColors()
  return {
    animation: animationFlag(),
    textStyle: baseChartTextStyle(colors),
    tooltip: {
      ...baseTooltip(colors),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as {
          name?: string
          data?: { sampleCount?: number; medianSeconds?: number | null }
          value?: number
        }
        const avg = formatHandlingDuration(
          typeof first.value === 'number' ? first.value : null,
        )
        const median = formatHandlingDuration(first.data?.medianSeconds ?? null)
        const samples = first.data?.sampleCount ?? 0
        return `${first.name}<br/>${t('admin.courierAnalytics.averageHandlingDuration')}: <b>${avg}</b><br/>${t('admin.courierAnalytics.medianHandlingDuration')}: ${median}<br/>${t('admin.courierAnalytics.sampleCount')}: ${samples}`
      },
    },
    grid: { left: 120, right: 48, top: 8, bottom: 32, containLabel: false },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: colors.textMuted,
        formatter: (v: number) => formatHandlingDuration(v),
      },
      splitLine: { lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: 'category',
      data: items.map(i => i.displayName),
      inverse: false,
      axisLabel: {
        color: colors.text,
        width: 100,
        overflow: 'truncate',
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: items.map(i => ({
          value: i.averageSeconds,
          courierProfileId: i.courierProfileId,
          sampleCount: i.sampleCount,
          medianSeconds: i.medianSeconds,
        })),
        barMaxWidth: 22,
        itemStyle: { color: colors.secondary },
        label: {
          show: true,
          position: 'right',
          formatter: (p: unknown) => {
            const value = (p as { value?: unknown }).value
            return formatHandlingDuration(
              typeof value === 'number' ? value : null,
            )
          },
          color: colors.textMuted,
          fontSize: 11,
        },
      },
    ],
  }
}
