/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { RouteStatus } from '@vaccin-delivery/types'

import FeatureDeliveryStopQrModal from '@/components/feature/delivery-qr/FeatureDeliveryStopQrModal.vue'
import { useDeliveryStopQrDisplay } from '@/composables/useDeliveryStopQrDisplay'
import { DeliveryQrRestError } from '@/api/delivery-qr-errors'
import { __resetAppI18nForTests, translate } from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'

const queryMock = vi.fn()
const fetchImageMock = vi.fn()
const revokeObjectURLMock = vi.fn()

vi.mock('@/composables/useGraphQL', () => ({
  default: () => ({
    apolloClient: {
      query: (...args: unknown[]) => queryMock(...args),
    },
  }),
}))

vi.mock('@/api/delivery-stop-qr-image-rest', async () => {
  const actual = await vi.importActual<
    typeof import('@/api/delivery-stop-qr-image-rest')
  >('@/api/delivery-stop-qr-image-rest')
  return {
    ...actual,
    fetchDeliveryStopQrImage: (...args: unknown[]) => fetchImageMock(...args),
  }
})

describe('useDeliveryStopQrDisplay + FeatureDeliveryStopQrModal', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('en')
    queryMock.mockReset()
    fetchImageMock.mockReset()
    revokeObjectURLMock.mockReset()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:qr-modal'),
      revokeObjectURL: revokeObjectURLMock,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('loads authenticated SVG, shows metadata, and revokes URL on close', async () => {
    queryMock.mockResolvedValue({
      data: {
        deliveryStopQr: {
          routeId: 'route-1',
          stopId: 'stop-1',
          routeDate: '2026-07-26',
          pharmacyName: 'Apotheek Centrum',
          address: {
            street: 'Hoofdstraat',
            houseNumber: '1',
            postalCode: '1000',
            city: 'Brussel',
            country: 'BE',
          },
          orderCount: 2,
          orderIds: ['ord-1', 'ord-2'],
          qrAvailable: true,
          qrConsumed: false,
          issuedAt: '2026-07-26T08:00:00.000Z',
          qrImagePath: '/delivery-routes/route-1/stops/stop-1/qr',
        },
      },
    })
    fetchImageMock.mockResolvedValue({
      objectUrl: 'blob:qr-modal',
      blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      contentType: 'image/svg+xml',
    })

    const display = useDeliveryStopQrDisplay()
    await display.openDeliveryStopQr({
      routeId: 'route-1',
      stopId: 'stop-1',
      routeDate: '2026-07-26',
      routeStatus: RouteStatus.Assigned,
      stopSequence: 2,
      pharmacyName: 'Apotheek Centrum',
      address: {
        street: 'Hoofdstraat',
        houseNumber: '1',
        postalCode: '1000',
        city: 'Brussel',
        country: 'BE',
      },
      orderCount: 2,
      orders: [
        {
          orderId: 'ord-1',
          status: 'PLANNED',
          lines: [{ vaccineId: 'v1', vaccineName: 'Flu', quantity: 3 }],
        },
        {
          orderId: 'ord-2',
          status: 'PLANNED',
          lines: [{ vaccineId: 'v2', vaccineName: 'Covid', quantity: 1 }],
        },
      ],
      qrAvailable: true,
      qrConsumed: false,
    })

    expect(queryMock).toHaveBeenCalled()
    expect(fetchImageMock).toHaveBeenCalledWith('route-1', 'stop-1')
    expect(display.objectUrl.value).toBe('blob:qr-modal')
    expect(display.downloadFilename.value).toBe(
      'delivery-qr-2026-07-26-stop-2.svg',
    )
    expect(display.downloadFilename.value).not.toMatch(/token|nonce/i)

    const wrapper = mount(FeatureDeliveryStopQrModal, {
      props: {
        open: true,
        context: display.context.value,
        objectUrl: display.objectUrl.value,
        loading: false,
        errorMessage: null,
        inactiveMessage: null,
        canDownload: true,
        downloadFilename: display.downloadFilename.value,
      },
      attachTo: document.body,
      global: {
        plugins: [createTestI18n('en')],
        stubs: {
          UModal: {
            props: ['open', 'title'],
            template:
              '<div v-if="open" data-testid="delivery-stop-qr-modal-root"><slot name="body" /><slot name="footer" /></div>',
          },
          UAlert: {
            props: ['title', 'description'],
            template:
              '<div data-testid="u-alert"><p>{{ title }}</p><p>{{ description }}</p></div>',
          },
          UButton: { template: '<button type="button"><slot /></button>' },
          UBadge: { template: '<span><slot /></span>' },
          CommonLoadingSkeleton: { template: '<div />' },
        },
      },
    })
    await flushPromises()
    await nextTick()

    expect(display.context.value?.pharmacyName).toBe('Apotheek Centrum')

    const pharmacy =
      wrapper.find('[data-testid="delivery-stop-qr-pharmacy"]')
    const pharmacyEl =
      pharmacy.exists()
        ? pharmacy
        : document.querySelector('[data-testid="delivery-stop-qr-pharmacy"]')

    const html =
      typeof pharmacyEl === 'object' &&
      pharmacyEl !== null &&
      'text' in pharmacyEl
        ? wrapper.html()
        : document.body.innerHTML

    expect(html).toContain('Apotheek Centrum')
    expect(html).toContain('Brussel')
    expect(html).toContain('ord-1')
    expect(html).toContain('Flu')
    expect(html).toContain(translate('deliveryStopQr.modal.showToCourier'))
    expect(html).toContain(
      translate('deliveryStopQr.modal.scanDoesNotComplete'),
    )
    expect(
      wrapper.find('[data-testid="delivery-stop-qr-image"]').exists() ||
        Boolean(
          document.querySelector('[data-testid="delivery-stop-qr-image"]'),
        ),
    ).toBe(true)

    const modalBodyEl = document.querySelector(
      '[data-testid="delivery-stop-qr-modal-body"]',
    )
    expect(modalBodyEl).not.toBeNull()
    const modalBodyClass = modalBodyEl?.className ?? ''
    expect(modalBodyClass).toContain('space-y-4')
    expect(modalBodyClass).not.toMatch(/overflow-y-auto/)
    expect(modalBodyClass).not.toMatch(/max-h-/)

    display.closeModal()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:qr-modal')
    expect(display.objectUrl.value).toBeNull()
    wrapper.unmount()
  })

  it('replaces active QR when authoritative state becomes consumed', async () => {
    const stops = ref([
      {
        routeId: 'route-1',
        stopId: 'stop-1',
        qrAvailable: true,
        qrConsumed: false,
      },
    ])

    queryMock.mockResolvedValue({
      data: {
        deliveryStopQr: {
          routeId: 'route-1',
          stopId: 'stop-1',
          routeDate: '2026-07-26',
          pharmacyName: 'Apotheek',
          address: {
            street: 'A',
            houseNumber: '1',
            postalCode: '1000',
            city: 'X',
            country: 'BE',
          },
          orderCount: 1,
          orderIds: ['o1'],
          qrAvailable: true,
          qrConsumed: false,
          issuedAt: null,
          qrImagePath: '/delivery-routes/route-1/stops/stop-1/qr',
        },
      },
    })
    fetchImageMock.mockResolvedValue({
      objectUrl: 'blob:active',
      blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      contentType: 'image/svg+xml',
    })

    const display = useDeliveryStopQrDisplay({
      authoritativeStops: computed(() => stops.value),
    })

    await display.openDeliveryStopQr({
      routeId: 'route-1',
      stopId: 'stop-1',
      routeDate: '2026-07-26',
      stopSequence: 1,
      pharmacyName: 'Apotheek',
      address: {
        street: 'A',
        houseNumber: '1',
        postalCode: '1000',
        city: 'X',
        country: 'BE',
      },
      orderCount: 1,
      orders: [],
      qrAvailable: true,
      qrConsumed: false,
    })

    expect(display.objectUrl.value).toBe('blob:active')

    stops.value = [
      {
        routeId: 'route-1',
        stopId: 'stop-1',
        qrAvailable: false,
        qrConsumed: true,
      },
    ]
    await nextTick()
    await flushPromises()

    expect(display.objectUrl.value).toBeNull()
    expect(display.inactiveMessage.value).toBe(
      translate('errors.deliveryStopQr.consumed'),
    )
  })

  it('maps REST rejection while modal is open', async () => {
    queryMock.mockRejectedValue(
      new DeliveryQrRestError(400, 'DELIVERY_QR_ROUTE_INACTIVE'),
    )

    const display = useDeliveryStopQrDisplay()
    await display.openDeliveryStopQr({
      routeId: 'route-1',
      stopId: 'stop-1',
      routeDate: '2026-07-26',
      stopSequence: 1,
      pharmacyName: 'Apotheek',
      address: {
        street: 'A',
        houseNumber: '1',
        postalCode: '1000',
        city: 'X',
        country: 'BE',
      },
      orderCount: 1,
      orders: [],
      qrAvailable: true,
      qrConsumed: false,
    })

    expect(display.objectUrl.value).toBeNull()
    expect(display.errorMessage.value).toBe(
      translate('errors.deliveryStopQr.routeInactive'),
    )
  })
})

describe('GraphQL surface safety (PWA)', () => {
  it('does not expose encodedToken or nonceHash in delivery-stop-qr documents', async () => {
    const mod = await import('@/assets/graphql/delivery-stop-qr')
    const serialized = JSON.stringify({
      deliveryStopQr: mod.DELIVERY_STOP_QR_QUERY,
      myPlannedDeliveries: mod.MY_PLANNED_DELIVERIES_QUERY,
    })
    expect(serialized).not.toContain('encodedToken')
    expect(serialized).not.toContain('nonceHash')
  })
})
