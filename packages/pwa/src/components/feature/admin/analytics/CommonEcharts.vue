<template>
  <div
    class="courier-chart-wrapper relative w-full min-w-0"
    :aria-label="title"
    role="img"
  >
    <div v-if="title || subtitle" class="mb-3">
      <h3 v-if="title" class="text-sm font-semibold text-default">
        {{ title }}
      </h3>
      <p v-if="subtitle" class="mt-0.5 text-xs text-muted">{{ subtitle }}</p>
    </div>

    <div
      v-if="loading"
      class="flex items-center justify-center rounded-lg border border-default bg-elevated"
      :style="{ minHeight: `${minHeight}px` }"
      aria-busy="true"
    >
      <CommonLoadingSkeleton />
    </div>

    <CommonEmptyState
      v-else-if="empty"
      :title="emptyTitle"
      :description="emptyDescription"
      class="rounded-lg border border-default bg-elevated"
      :style="{ minHeight: `${minHeight}px` }"
    />

    <div
      v-show="!loading && !empty"
      ref="chartHost"
      class="w-full min-w-0"
      :style="{ height: `${minHeight}px` }"
      data-testid="echarts-host"
    />

    <p v-if="caption && !loading" class="mt-2 text-xs text-muted">
      {{ caption }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'

import CommonEmptyState from '@/components/common/CommonEmptyState.vue'
import CommonLoadingSkeleton from '@/components/common/CommonLoadingSkeleton.vue'
import {
  echartsInit,
  prefersReducedMotion,
  type EChartsOption,
} from '@/components/feature/admin/analytics/echarts-setup'

const props = defineProps({
  option: {
    type: Object as PropType<EChartsOption | null>,
    default: null,
  },
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  caption: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  empty: {
    type: Boolean,
    default: false,
  },
  emptyTitle: {
    type: String,
    default: '',
  },
  emptyDescription: {
    type: String,
    default: '',
  },
  minHeight: {
    type: Number,
    default: 280,
  },
})

const emit = defineEmits<{
  chartClick: [payload: { courierProfileId?: string; name?: string }]
}>()

const chartHost = ref<HTMLElement | null>(null)

type EChartsInstance = ReturnType<typeof echartsInit>
let chart: EChartsInstance | null = null
let resizeObserver: ResizeObserver | null = null

function disposeChart(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (chart) {
    chart.dispose()
    chart = null
  }
}

function applyOption(): void {
  if (!chart || !props.option || props.empty || props.loading) {
    return
  }
  chart.setOption(props.option, {
    notMerge: true,
    lazyUpdate: true,
  })
}

function ensureChart(): void {
  if (typeof window === 'undefined' || !chartHost.value) {
    return
  }
  if (props.loading || props.empty) {
    disposeChart()
    return
  }
  if (!chart) {
    chart = echartsInit(chartHost.value, undefined, {
      renderer: 'canvas',
    })
    chart.on('click', (params: unknown) => {
      const p = params as {
        data?: { courierProfileId?: string }
        name?: string
      }
      emit('chartClick', {
        courierProfileId: p.data?.courierProfileId,
        name: p.name,
      })
    })
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        chart?.resize()
      })
      resizeObserver.observe(chartHost.value)
    }
  }
  applyOption()
}

onMounted(() => {
  ensureChart()
})

onBeforeUnmount(() => {
  disposeChart()
})

watch(
  () => [props.option, props.loading, props.empty] as const,
  () => {
    ensureChart()
  },
  { deep: true },
)

watch(
  () => prefersReducedMotion(),
  reduced => {
    if (chart && props.option) {
      chart.setOption(
        {
          ...props.option,
          animation: !reduced,
        },
        { notMerge: true },
      )
    }
  },
)

defineExpose({
  /** Test / debug helper — dispose chart instance. */
  dispose: disposeChart,
  /** Test helper — trigger resize. */
  resize: () => chart?.resize(),
  getInstance: () => chart,
})
</script>
