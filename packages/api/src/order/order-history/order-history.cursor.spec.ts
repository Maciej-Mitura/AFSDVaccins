import { encodeOrderHistoryCursor, decodeOrderHistoryCursor } from './order-history.cursor'

describe('order-history.cursor', () => {
  const submittedAt = new Date('2026-07-14T10:00:00.000Z')
  const id = '6a569d2cbb2590db980429cd'

  it('round-trips submittedAt and id', () => {
    const cursor = encodeOrderHistoryCursor(submittedAt, id)
    const decoded = decodeOrderHistoryCursor(cursor)

    expect(decoded).not.toBeNull()
    expect(decoded?.submittedAt.toISOString()).toBe(submittedAt.toISOString())
    expect(decoded?.objectId.toString()).toBe(id)
  })

  it('rejects malformed cursors', () => {
    expect(decodeOrderHistoryCursor('not-base64')).toBeNull()
    expect(decodeOrderHistoryCursor('')).toBeNull()
    expect(
      decodeOrderHistoryCursor(
        Buffer.from(JSON.stringify({ submittedAt: 'nope', id }), 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull()
  })
})
