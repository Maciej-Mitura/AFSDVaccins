import jsQR from 'jsqr'
import { PNG } from 'pngjs'

import { DeliveryStopQrImageService } from './delivery-stop-qr-image.service'

describe('DeliveryStopQrImageService', () => {
  const service = new DeliveryStopQrImageService()
  const token =
    'eyJ2IjoxLCJyb3V0ZUlkIjoiciIsInN0b3BJZCI6InMiLCJub25jZSI6Im4ifQ.dGVzdC1zaWduYXR1cmU'

  it('renders deterministic SVG for the same token and settings', async () => {
    const first = await service.renderSvg(token)
    const second = await service.renderSvg(token)

    expect(first).toBe(second)
    expect(first).toContain('<svg')
    expect(first).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(first).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
  })

  it('does not embed the raw token as visible SVG text', async () => {
    const svg = await service.renderSvg(token)
    expect(svg).not.toContain(token)
  })

  it('PNG round-trip decodes back to the stored encodedToken', async () => {
    const pngBuffer = await service.renderPngBuffer(token)
    const png = PNG.sync.read(pngBuffer)
    const decoded = jsQR(
      new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
      png.width,
      png.height,
    )

    expect(decoded).not.toBeNull()
    expect(decoded?.data).toBe(token)
  })
})
