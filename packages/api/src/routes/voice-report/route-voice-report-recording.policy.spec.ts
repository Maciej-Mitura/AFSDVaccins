import { RouteStatus } from '../route-status.enum'
import {
  isLegacyRouteVoiceReport,
  resolveStopForVoiceReport,
} from './route-voice-report-recording.policy'

describe('route-voice-report-recording.policy', () => {
  const stop = {
    stopId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sequence: 2,
    apothekerProfileId: '507f1f77bcf86cd799439011',
    apothekerUserId: '507f1f77bcf86cd799439012',
    pharmacyName: 'Apotheek Centrum',
    address: {} as never,
    orderIds: ['o1'],
    orderCount: 1,
    totalQuantity: 2,
    lines: [],
  }

  it('allows recording on IN_PROGRESS when stop belongs to route', () => {
    const decision = resolveStopForVoiceReport(
      { status: RouteStatus.IN_PROGRESS, stops: [stop] },
      stop.stopId,
    )
    expect(decision.allowed).toBe(true)
    if (decision.allowed) {
      expect(decision.stop.stopId).toBe(stop.stopId)
    }
  })

  it('rejects missing stopId', () => {
    const decision = resolveStopForVoiceReport(
      { status: RouteStatus.IN_PROGRESS, stops: [stop] },
      '',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toBe('stop_id_required')
    }
  })

  it('rejects stop not on route', () => {
    const decision = resolveStopForVoiceReport(
      { status: RouteStatus.IN_PROGRESS, stops: [stop] },
      'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee',
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toBe('stop_not_found')
    }
  })

  it('rejects when route is not IN_PROGRESS', () => {
    const decision = resolveStopForVoiceReport(
      { status: RouteStatus.COMPLETED, stops: [stop] },
      stop.stopId,
    )
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toBe('route_not_in_progress')
    }
  })

  it('classifies legacy reports without guessing a stop', () => {
    expect(isLegacyRouteVoiceReport({ stopId: null })).toBe(true)
    expect(isLegacyRouteVoiceReport({ stopId: undefined })).toBe(true)
    expect(isLegacyRouteVoiceReport({ stopId: '' })).toBe(true)
    expect(isLegacyRouteVoiceReport({ stopId: stop.stopId })).toBe(false)
  })
})
