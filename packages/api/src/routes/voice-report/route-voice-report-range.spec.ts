import { parseSingleByteRange } from './route-voice-report.service'

describe('parseSingleByteRange', () => {
  const totalSize = 1000

  it('treats missing or blank Range as full', () => {
    expect(parseSingleByteRange(undefined, totalSize)).toEqual({ kind: 'full' })
    expect(parseSingleByteRange(null as unknown as undefined, totalSize)).toEqual(
      { kind: 'full' },
    )
    expect(parseSingleByteRange('', totalSize)).toEqual({ kind: 'full' })
    expect(parseSingleByteRange('   ', totalSize)).toEqual({ kind: 'full' })
  })

  it('parses a single closed byte range', () => {
    expect(parseSingleByteRange('bytes=0-99', totalSize)).toEqual({
      kind: 'single',
      start: 0,
      end: 99,
    })
  })

  it('parses open-ended range through end of resource', () => {
    expect(parseSingleByteRange('bytes=900-', totalSize)).toEqual({
      kind: 'single',
      start: 900,
      end: 999,
    })
  })

  it('parses suffix range bytes=-N', () => {
    expect(parseSingleByteRange('bytes=-100', totalSize)).toEqual({
      kind: 'single',
      start: 900,
      end: 999,
    })
  })

  it('clamps end past totalSize - 1', () => {
    expect(parseSingleByteRange('bytes=0-5000', totalSize)).toEqual({
      kind: 'single',
      start: 0,
      end: 999,
    })
  })

  it('rejects multi-range requests', () => {
    expect(parseSingleByteRange('bytes=0-50,100-150', totalSize)).toEqual({
      kind: 'invalid',
    })
  })

  it('rejects non-bytes units and malformed headers', () => {
    expect(parseSingleByteRange('items=0-10', totalSize)).toEqual({
      kind: 'invalid',
    })
    expect(parseSingleByteRange('bytes=', totalSize)).toEqual({
      kind: 'invalid',
    })
    expect(parseSingleByteRange('bytes=-', totalSize)).toEqual({
      kind: 'invalid',
    })
    expect(parseSingleByteRange('bytes=abc-def', totalSize)).toEqual({
      kind: 'invalid',
    })
  })

  it('rejects start beyond totalSize or end before start', () => {
    expect(parseSingleByteRange('bytes=1000-1001', totalSize)).toEqual({
      kind: 'invalid',
    })
    expect(parseSingleByteRange('bytes=50-40', totalSize)).toEqual({
      kind: 'invalid',
    })
  })

  it('rejects non-positive suffix length', () => {
    expect(parseSingleByteRange('bytes=-0', totalSize)).toEqual({
      kind: 'invalid',
    })
  })
})
