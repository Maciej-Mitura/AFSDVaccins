import {
  isPharmacyProfileComplete,
  RouteGenerationDiagnosticsCollector,
} from './route-generation-diagnostics.util'
import { RouteGenerationSkipReasonCode } from './route-generation-skip-reason.enum'

describe('RouteGenerationDiagnosticsCollector', () => {
  it('does not duplicate the same order across skip groups', () => {
    const collector = new RouteGenerationDiagnosticsCollector()
    collector.addSkip({
      code: RouteGenerationSkipReasonCode.PHARMACY_NOT_IN_ACTIVE_TEMPLATE,
      apothekerProfileId: 'p1',
      pharmacyName: 'Apotheek A',
      orderIds: ['o1', 'o2'],
    })
    collector.addSkip({
      code: RouteGenerationSkipReasonCode.ORDER_STATUS_NOT_ELIGIBLE,
      apothekerProfileId: 'p2',
      pharmacyName: 'Apotheek B',
      orderIds: ['o1', 'o3'],
    })

    const diagnostics = collector.build({
      includedOrderCount: 1,
      includedStopCount: 1,
      regenerated: false,
      regenerationNeeded: false,
    })

    expect(diagnostics.skippedOrderCount).toBe(3)
    expect(
      diagnostics.skipGroups.find(
        group =>
          group.code ===
          RouteGenerationSkipReasonCode.ORDER_STATUS_NOT_ELIGIBLE,
      )?.orderIds,
    ).toEqual(['o3'])
  })

  it('detects incomplete pharmacy profiles', () => {
    expect(
      isPharmacyProfileComplete({
        pharmacyName: 'A',
        address: {
          street: 'S',
          houseNumber: '1',
          postalCode: '9000',
          city: 'Gent',
          country: 'BE',
        },
      }),
    ).toBe(true)

    expect(
      isPharmacyProfileComplete({
        pharmacyName: ' ',
        address: {
          street: 'S',
          houseNumber: '1',
          postalCode: '9000',
          city: 'Gent',
          country: 'BE',
        },
      }),
    ).toBe(false)
  })
})
