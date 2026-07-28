/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { RouteStatus } from '@vaccin-delivery/types'

import FeatureRouteLocationStatusCard from '@/components/feature/routes/FeatureRouteLocationStatusCard.vue'
import {
  formatLocationRecordedAt,
  toPharmacistNextStopLocationProps,
  toRouteLocationStatusCardProps,
} from '@/components/feature/routes/route-location-status'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const uiStubs = {
  UAlert: { template: '<div><slot /></div>' },
}

function mountCard(
  props: InstanceType<typeof FeatureRouteLocationStatusCard>['$props'],
) {
  return mount(FeatureRouteLocationStatusCard, {
    props,
    global: { plugins: [createTestI18n('en')], stubs: uiStubs },
  })
}

describe('FeatureRouteLocationStatusCard', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('admin sees active route location with source, timestamp, and next stop', () => {
    const recordedAt = '2026-07-27T12:32:00.000Z'
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Kortrijk',
          recordedAt,
          source: 'ARRIVAL' as never,
          stopSequence: 1,
          hasNextStop: true,
          nextStop: {
            stopId: 'stop-2',
            sequence: 2,
            pharmacyName: 'Apotheek Centrum',
            city: 'Gent',
          },
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'ADMIN',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-heading"]').text()).toBe(
      translate('routes.location.title'),
    )
    expect(wrapper.find('[data-testid="route-location-city"]').text()).toBe(
      'Kortrijk',
    )
    expect(
      wrapper.find('[data-testid="route-location-recorded-at"]').text(),
    ).toContain(formatLocationRecordedAt(recordedAt))
    expect(wrapper.find('[data-testid="route-location-source"]').text()).toBe(
      translate('routes.location.source.arrivalAtStop', { sequence: 1 }),
    )
    expect(
      wrapper.find('[data-testid="route-location-next-stop"]').text(),
    ).toBe(
      translate('routes.location.nextStopDetail', {
        sequence: 2,
        name: 'Apotheek Centrum',
        city: 'Gent',
      }),
    )
    expect(wrapper.text()).not.toMatch(/eventId|latitude|longitude|gps/i)
  })

  it('admin sees no-location empty state', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: false,
          city: null,
          recordedAt: null,
          source: null,
          stopSequence: null,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'ADMIN',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-empty"]').text()).toBe(
      translate('routes.location.noneYet'),
    )
  })

  it('completed route displays historical wording', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Brugge',
          recordedAt: '2026-07-26T10:00:00.000Z',
          source: 'DELIVERY' as never,
          stopSequence: 3,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.Completed,
        viewerRole: 'ADMIN',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-heading"]').text()).toBe(
      translate('routes.location.lastRecordedRouteLocation'),
    )
    expect(
      wrapper.find('[data-testid="route-location-historical-label"]').text(),
    ).toBe(translate('routes.location.historical'))
    expect(
      wrapper.find('[data-testid="route-location-next-stop-section"]').exists(),
    ).toBe(false)
  })

  it('cancelled route displays historical wording', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Oostende',
          recordedAt: '2026-07-26T11:00:00.000Z',
          source: 'ARRIVAL' as never,
          stopSequence: 1,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.Cancelled,
        viewerRole: 'ADMIN',
      }),
    )

    expect(wrapper.attributes('data-historical')).toBe('true')
    expect(
      wrapper.find('[data-testid="route-location-next-stop-section"]').exists(),
    ).toBe(false)
  })

  it('shows no later stop empty state when location exists without next', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Kortrijk',
          recordedAt: '2026-07-27T12:00:00.000Z',
          source: 'DELIVERY' as never,
          stopSequence: 4,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'ADMIN',
      }),
    )

    expect(
      wrapper.find('[data-testid="route-location-no-next-stop"]').text(),
    ).toBe(translate('routes.location.noLaterStop'))
  })

  it('assigned courier sees own location and next pharmacy', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Kortrijk',
          recordedAt: '2026-07-27T12:32:00.000Z',
          source: 'DELIVERY' as never,
          stopSequence: 1,
          hasNextStop: true,
          nextStop: {
            stopId: 'stop-2',
            sequence: 2,
            pharmacyName: 'Apotheek Noord',
            city: 'Roeselare',
          },
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'BEZORGER',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-heading"]').text()).toBe(
      translate('routes.location.yourLastRecordedLocation'),
    )
    expect(wrapper.find('[data-testid="route-location-city"]').text()).toBe(
      'Kortrijk',
    )
    expect(wrapper.find('[data-testid="route-location-source"]').text()).toBe(
      translate('routes.location.source.deliveryAtStop', { sequence: 1 }),
    )
    expect(
      wrapper.find('[data-testid="route-location-next-stop"]').text(),
    ).toContain('Apotheek Noord')
  })

  it('courier no-location explanation is shown', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: false,
          city: null,
          recordedAt: null,
          source: null,
          stopSequence: null,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'BEZORGER',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-empty"]').text()).toBe(
      translate('routes.location.updatesAfterArrivalOrDelivery'),
    )
  })

  it('ARRIVAL and DELIVERY source wording are correct', () => {
    const arrival = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'A',
          recordedAt: '2026-07-27T10:00:00.000Z',
          source: 'ARRIVAL' as never,
          stopSequence: 2,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'ADMIN',
      }),
    )
    expect(arrival.find('[data-testid="route-location-source"]').text()).toBe(
      translate('routes.location.source.arrivalAtStop', { sequence: 2 }),
    )

    const delivery = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'B',
          recordedAt: '2026-07-27T10:00:00.000Z',
          source: 'DELIVERY' as never,
          stopSequence: 3,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'ADMIN',
      }),
    )
    expect(delivery.find('[data-testid="route-location-source"]').text()).toBe(
      translate('routes.location.source.deliveryAtStop', { sequence: 3 }),
    )
  })

  it('offline courier snapshot displays cached location with outdated warning', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: true,
          city: 'Kortrijk',
          recordedAt: '2026-07-27T09:00:00.000Z',
          source: 'ARRIVAL' as never,
          stopSequence: 1,
          hasNextStop: true,
          nextStop: {
            stopId: 's2',
            sequence: 2,
            pharmacyName: 'Next',
            city: 'Gent',
          },
        },
        routeStatus: RouteStatus.InProgress,
        viewerRole: 'BEZORGER',
        isOfflineSnapshot: true,
      }),
    )

    expect(wrapper.attributes('data-offline-snapshot')).toBe('true')
    expect(
      wrapper.find('[data-testid="route-location-outdated-warning"]').text(),
    ).toBe(translate('routes.location.mayBeOutdated'))
    expect(wrapper.find('[data-testid="route-location-city"]').text()).toBe(
      'Kortrijk',
    )
  })

  it('pharmacist next-stop block shows city, time, and non-live explanation', () => {
    const recordedAt = '2026-07-27T12:32:00.000Z'
    const wrapper = mountCard(
      toPharmacistNextStopLocationProps({
        routeStatus: RouteStatus.InProgress,
        city: 'Kortrijk',
        recordedAt,
        source: 'DELIVERY',
      }),
    )

    expect(wrapper.find('[data-testid="route-location-heading"]').text()).toBe(
      translate('routes.location.yourDeliveryIsNext'),
    )
    expect(
      wrapper.find('[data-testid="route-location-pharmacist-city"]').text(),
    ).toBe(
      translate('routes.location.courierLastLocation', { city: 'Kortrijk' }),
    )
    expect(
      wrapper.find('[data-testid="route-location-pharmacist-updated"]').text(),
    ).toBe(
      translate('routes.location.lastUpdated', {
        dateTime: formatLocationRecordedAt(recordedAt),
      }),
    )
    expect(
      wrapper.find('[data-testid="route-location-not-live-gps"]').text(),
    ).toBe(translate('routes.location.notLiveGps'))
    expect(
      wrapper.find('[data-testid="route-location-next-stop-section"]').exists(),
    ).toBe(false)
  })

  it('ASSIGNED route does not show active next-stop section', () => {
    const wrapper = mountCard(
      toRouteLocationStatusCardProps({
        locationStatus: {
          hasLocation: false,
          city: null,
          recordedAt: null,
          source: null,
          stopSequence: null,
          hasNextStop: false,
          nextStop: null,
        },
        routeStatus: RouteStatus.Assigned,
        viewerRole: 'ADMIN',
      }),
    )

    expect(
      wrapper.find('[data-testid="route-location-next-stop-section"]').exists(),
    ).toBe(false)
  })

  it('location unavailable shows non-blocking error', () => {
    const wrapper = mountCard({
      hasLocation: false,
      city: null,
      recordedAt: null,
      source: null,
      stopSequence: null,
      hasNextStop: false,
      nextStopName: null,
      nextStopSequence: null,
      nextStopCity: null,
      routeStatus: RouteStatus.InProgress,
      viewerRole: 'ADMIN',
      locationUnavailable: true,
    })

    expect(
      wrapper.find('[data-testid="route-location-unavailable"]').text(),
    ).toBe(translate('routes.location.unavailable'))
  })

  it('formats same-day timestamps as time-only', () => {
    const now = new Date(2026, 6, 27, 15, 0, 0)
    const sameDay = new Date(2026, 6, 27, 14, 32, 0)
    const label = formatLocationRecordedAt(sameDay, now)
    expect(label.length).toBeGreaterThan(0)
    expect(label).not.toMatch(/2026/)
  })

  it('supports inset variant without bordered card chrome', () => {
    const wrapper = mountCard({
      hasLocation: true,
      city: 'Gent',
      recordedAt: '2026-07-27T12:00:00.000Z',
      source: 'ARRIVAL',
      stopSequence: 1,
      hasNextStop: false,
      nextStopName: null,
      nextStopSequence: null,
      nextStopCity: null,
      routeStatus: RouteStatus.InProgress,
      viewerRole: 'BEZORGER',
      variant: 'inset',
    })

    expect(wrapper.attributes('data-variant')).toBe('inset')
    expect(wrapper.classes()).toContain('bg-muted')
    expect(wrapper.classes()).not.toContain('border')
  })
})
