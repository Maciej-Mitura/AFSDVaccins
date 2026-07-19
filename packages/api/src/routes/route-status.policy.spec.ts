import { RouteStatus } from './route-status.enum'
import {
  canBezorgerTransitionRouteStatus,
  canCancelRoute,
  canTransitionRouteStatus,
  isTerminalRouteStatus,
} from './route-status.policy'

describe('RouteStatusPolicy', () => {
  it('allows ASSIGNED to IN_PROGRESS', () => {
    expect(
      canTransitionRouteStatus(RouteStatus.ASSIGNED, RouteStatus.IN_PROGRESS),
    ).toBe(true)
  })

  it('allows IN_PROGRESS to COMPLETED', () => {
    expect(
      canTransitionRouteStatus(
        RouteStatus.IN_PROGRESS,
        RouteStatus.COMPLETED,
      ),
    ).toBe(true)
  })

  it('allows ASSIGNED and IN_PROGRESS to CANCELLED', () => {
    expect(
      canTransitionRouteStatus(RouteStatus.ASSIGNED, RouteStatus.CANCELLED),
    ).toBe(true)
    expect(
      canTransitionRouteStatus(RouteStatus.IN_PROGRESS, RouteStatus.CANCELLED),
    ).toBe(true)
  })

  it('rejects invalid transitions', () => {
    expect(
      canTransitionRouteStatus(RouteStatus.ASSIGNED, RouteStatus.COMPLETED),
    ).toBe(false)
    expect(
      canTransitionRouteStatus(RouteStatus.IN_PROGRESS, RouteStatus.ASSIGNED),
    ).toBe(false)
    expect(
      canTransitionRouteStatus(RouteStatus.COMPLETED, RouteStatus.ASSIGNED),
    ).toBe(false)
  })

  it('treats COMPLETED as terminal', () => {
    expect(isTerminalRouteStatus(RouteStatus.COMPLETED)).toBe(true)
    expect(
      canTransitionRouteStatus(RouteStatus.COMPLETED, RouteStatus.CANCELLED),
    ).toBe(false)
  })

  it('treats CANCELLED as terminal', () => {
    expect(isTerminalRouteStatus(RouteStatus.CANCELLED)).toBe(true)
    expect(
      canTransitionRouteStatus(RouteStatus.CANCELLED, RouteStatus.ASSIGNED),
    ).toBe(false)
  })

  it('allows idempotent same-status requests', () => {
    expect(
      canTransitionRouteStatus(RouteStatus.ASSIGNED, RouteStatus.ASSIGNED),
    ).toBe(true)
    expect(
      canTransitionRouteStatus(
        RouteStatus.IN_PROGRESS,
        RouteStatus.IN_PROGRESS,
      ),
    ).toBe(true)
  })

  it('allows admin cancel only from non-terminal statuses', () => {
    expect(canCancelRoute(RouteStatus.ASSIGNED)).toBe(true)
    expect(canCancelRoute(RouteStatus.IN_PROGRESS)).toBe(true)
    expect(canCancelRoute(RouteStatus.COMPLETED)).toBe(false)
    expect(canCancelRoute(RouteStatus.CANCELLED)).toBe(false)
  })

  it('limits BEZORGER to start and complete only', () => {
    expect(
      canBezorgerTransitionRouteStatus(
        RouteStatus.ASSIGNED,
        RouteStatus.IN_PROGRESS,
      ),
    ).toBe(true)
    expect(
      canBezorgerTransitionRouteStatus(
        RouteStatus.IN_PROGRESS,
        RouteStatus.COMPLETED,
      ),
    ).toBe(true)
    expect(
      canBezorgerTransitionRouteStatus(
        RouteStatus.ASSIGNED,
        RouteStatus.CANCELLED,
      ),
    ).toBe(false)
    expect(
      canBezorgerTransitionRouteStatus(
        RouteStatus.IN_PROGRESS,
        RouteStatus.CANCELLED,
      ),
    ).toBe(false)
  })
})
