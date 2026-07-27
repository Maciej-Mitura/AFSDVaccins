<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  formatLocationRecordedAt,
  isActiveInProgressStatus,
  isHistoricalRouteStatus,
  normalizeLocationSource,
  type RouteLocationStatusCardInput,
} from '@/components/feature/routes/route-location-status'

const props = withDefaults(defineProps<RouteLocationStatusCardInput>(), {
  isHistorical: undefined,
  isOfflineSnapshot: false,
  locationUnavailable: false,
})

const { t } = useI18n()

const historical = computed(
  () => props.isHistorical ?? isHistoricalRouteStatus(props.routeStatus),
)

const activeProgress = computed(
  () => isActiveInProgressStatus(props.routeStatus) && !historical.value,
)

const sourceKey = computed(() => normalizeLocationSource(props.source))

const recordedAtLabel = computed(() =>
  formatLocationRecordedAt(props.recordedAt),
)

const heading = computed(() => {
  if (props.viewerRole === 'APOTHEKER') {
    return t('routes.location.yourDeliveryIsNext')
  }
  if (historical.value) {
    return t('routes.location.lastRecordedRouteLocation')
  }
  if (props.viewerRole === 'BEZORGER') {
    return t('routes.location.yourLastRecordedLocation')
  }
  return t('routes.location.title')
})

const sourceText = computed(() => {
  if (!sourceKey.value) {
    return null
  }
  if (props.stopSequence != null) {
    return sourceKey.value === 'ARRIVAL'
      ? t('routes.location.source.arrivalAtStop', {
          sequence: props.stopSequence,
        })
      : t('routes.location.source.deliveryAtStop', {
          sequence: props.stopSequence,
        })
  }
  return sourceKey.value === 'ARRIVAL'
    ? t('routes.location.source.arrival')
    : t('routes.location.source.delivery')
})

const showNextStopSection = computed(
  () =>
    props.viewerRole !== 'APOTHEKER' &&
    activeProgress.value &&
    (props.hasNextStop || props.hasLocation),
)

const liveRegionMessage = computed(() => {
  if (props.locationUnavailable) {
    return t('routes.location.unavailable')
  }
  if (props.viewerRole === 'APOTHEKER' && props.hasLocation && props.city) {
    return `${t('routes.location.yourDeliveryIsNext')}. ${t(
      'routes.location.courierLastLocation',
      { city: props.city },
    )}`
  }
  if (props.hasLocation && props.city) {
    return `${heading.value}: ${props.city}`
  }
  return ''
})
</script>

<template>
  <section
    class="rounded-lg border border-default bg-elevated/40 px-3 py-3 text-sm sm:px-4"
    data-testid="route-location-status-card"
    :data-viewer-role="viewerRole"
    :data-historical="historical ? 'true' : 'false'"
    :data-offline-snapshot="isOfflineSnapshot ? 'true' : 'false'"
    :aria-label="heading"
  >
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
      data-testid="route-location-live-region"
    >
      {{ liveRegionMessage }}
    </div>

    <h3
      class="text-base font-semibold wrap-break-word"
      data-testid="route-location-heading"
    >
      {{ heading }}
    </h3>

    <p
      v-if="historical && hasLocation"
      class="mt-1 text-xs text-muted"
      data-testid="route-location-historical-label"
    >
      {{ t('routes.location.historical') }}
    </p>

    <p
      v-if="locationUnavailable"
      class="mt-2 text-muted"
      role="status"
      data-testid="route-location-unavailable"
    >
      {{ t('routes.location.unavailable') }}
    </p>

    <template v-else-if="viewerRole === 'APOTHEKER'">
      <p
        v-if="hasLocation && city"
        class="mt-2 wrap-break-word"
        data-testid="route-location-pharmacist-city"
      >
        {{ t('routes.location.courierLastLocation', { city }) }}
      </p>
      <p
        v-if="recordedAtLabel"
        class="mt-1 text-muted"
        data-testid="route-location-pharmacist-updated"
      >
        {{ t('routes.location.lastUpdated', { dateTime: recordedAtLabel }) }}
      </p>
      <p
        class="mt-2 text-xs text-muted"
        data-testid="route-location-not-live-gps"
      >
        {{ t('routes.location.notLiveGps') }}
      </p>
    </template>

    <template v-else>
      <template v-if="hasLocation && city">
        <dl class="mt-2 space-y-1.5">
          <div
            class="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-2"
          >
            <dt v-if="viewerRole === 'ADMIN'" class="font-medium shrink-0">
              {{ t('routes.location.lastRecordedCity') }}
            </dt>
            <dd
              class="wrap-break-word font-medium"
              data-testid="route-location-city"
            >
              {{ city }}
            </dd>
          </div>

          <div
            v-if="recordedAtLabel"
            class="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-2"
          >
            <dt class="font-medium shrink-0">
              {{ t('routes.location.recordedAtLabel') }}
            </dt>
            <dd data-testid="route-location-recorded-at">
              <time :datetime="String(recordedAt)">{{ recordedAtLabel }}</time>
            </dd>
          </div>

          <div
            v-if="sourceText"
            class="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-2"
          >
            <dt class="sr-only">{{ t('routes.location.source.arrival') }}</dt>
            <dd
              class="text-muted wrap-break-word"
              data-testid="route-location-source"
            >
              {{ sourceText }}
            </dd>
          </div>

          <div
            v-if="stopSequence != null"
            class="text-muted"
            data-testid="route-location-basis-stop"
          >
            {{ t('routes.location.basisStop', { sequence: stopSequence }) }}
          </div>
        </dl>

        <p
          v-if="isOfflineSnapshot"
          class="mt-2 text-xs text-warning"
          role="status"
          data-testid="route-location-outdated-warning"
        >
          {{ t('routes.location.mayBeOutdated') }}
        </p>
      </template>

      <p v-else class="mt-2 text-muted" data-testid="route-location-empty">
        <template v-if="viewerRole === 'BEZORGER'">
          {{ t('routes.location.updatesAfterArrivalOrDelivery') }}
        </template>
        <template v-else>
          {{ t('routes.location.noneYet') }}
        </template>
      </p>

      <div
        v-if="showNextStopSection"
        class="mt-3 border-t border-default pt-3"
        data-testid="route-location-next-stop-section"
      >
        <h4 class="font-medium" data-testid="route-location-next-stop-heading">
          {{ t('routes.location.nextStop') }}
        </h4>

        <p
          v-if="hasNextStop && nextStopSequence != null && nextStopName"
          class="mt-1 wrap-break-word"
          data-testid="route-location-next-stop"
        >
          {{
            t('routes.location.nextStopDetail', {
              sequence: nextStopSequence,
              name: nextStopName,
              city: nextStopCity ?? '',
            })
          }}
        </p>
        <p
          v-else
          class="mt-1 text-muted"
          data-testid="route-location-no-next-stop"
        >
          {{
            hasLocation
              ? t('routes.location.noLaterStop')
              : t('routes.location.noNextStopAvailable')
          }}
        </p>
      </div>
    </template>
  </section>
</template>
