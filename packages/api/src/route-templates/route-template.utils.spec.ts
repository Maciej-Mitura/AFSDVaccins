import {
  normalizeRouteTemplateName,
  orderStopsBySequence,
} from './route-template.utils'

describe('route-template.utils', () => {
  it('normalizes names for uniqueness', () => {
    expect(normalizeRouteTemplateName('  A   B  ')).toBe('a b')
  })

  it('orders stops by sequence ascending', () => {
    expect(
      orderStopsBySequence([
        { sequence: 3, id: 'c' },
        { sequence: 1, id: 'a' },
        { sequence: 2, id: 'b' },
      ]),
    ).toEqual([
      { sequence: 1, id: 'a' },
      { sequence: 2, id: 'b' },
      { sequence: 3, id: 'c' },
    ])
  })
})
