import { createHash } from 'node:crypto'
import { ObjectId } from 'mongodb'

import { FakeRouteVoiceReportStorageProvider } from './fake-route-voice-report-storage.provider'
import { ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME } from './route-voice-report.constants'
import {
  RouteVoiceReportNotFoundException,
  RouteVoiceReportStorageFailedException,
} from './route-voice-report.exceptions'

function webmBytes(extra = 48): Buffer {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(extra, 0x11),
  ])
}

function validBlobName(extension: 'webm' | 'ogg' | 'm4a' = 'webm'): string {
  const routeId = new ObjectId().toString()
  const reportId = new ObjectId().toString()
  return `route-voice-reports/${routeId}/${reportId}/audio.${extension}`
}

describe('FakeRouteVoiceReportStorageProvider', () => {
  let storage: FakeRouteVoiceReportStorageProvider

  beforeEach(() => {
    storage = new FakeRouteVoiceReportStorageProvider()
  })

  it('defaults container name to route-voice-reports', () => {
    expect(storage.containerName).toBe(ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME)
  })

  it('stores and retrieves bytes by opaque blob name', async () => {
    const blobName = validBlobName()
    const bytes = webmBytes()
    const sha256 = createHash('sha256').update(bytes).digest('hex')

    const result = await storage.store({
      bytes,
      blobName,
      mimeType: 'audio/webm',
      metadata: { reportid: new ObjectId().toString(), sha256prefix: sha256.slice(0, 16) },
    })

    expect(result).toEqual({
      blobName,
      containerName: ROUTE_VOICE_REPORT_DEFAULT_CONTAINER_NAME,
    })
    expect(storage.has(blobName)).toBe(true)
    expect(storage.getBytes(blobName)?.equals(bytes)).toBe(true)
    expect(await storage.exists(blobName)).toBe(true)

    const props = await storage.getProperties(blobName)
    expect(props).toEqual({
      contentLength: bytes.length,
      contentType: 'audio/webm',
    })
  })

  it('rejects overwrite of an existing blob by default', async () => {
    const blobName = validBlobName()
    const bytes = webmBytes()

    await storage.store({
      bytes,
      blobName,
      mimeType: 'audio/webm',
    })

    await expect(
      storage.store({
        bytes: webmBytes(64),
        blobName,
        mimeType: 'audio/webm',
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStorageFailedException)

    expect(storage.getBytes(blobName)?.equals(bytes)).toBe(true)
  })

  it('deletes a stored blob', async () => {
    const blobName = validBlobName()
    await storage.store({
      bytes: webmBytes(),
      blobName,
      mimeType: 'audio/webm',
    })

    await storage.delete(blobName)
    expect(storage.has(blobName)).toBe(false)
    expect(await storage.exists(blobName)).toBe(false)
    expect(await storage.getProperties(blobName)).toBeNull()
  })

  it('supports ranged downloads', async () => {
    const blobName = validBlobName()
    const bytes = webmBytes(100)
    await storage.store({
      bytes,
      blobName,
      mimeType: 'audio/webm',
    })

    const download = await storage.downloadRange({
      blobName,
      offset: 4,
      count: 10,
    })

    expect(download.contentLength).toBe(10)
    expect(download.rangeStart).toBe(4)
    expect(download.rangeEnd).toBe(13)
    expect(download.totalSize).toBe(bytes.length)
    expect(download.contentType).toBe('audio/webm')

    const chunks: Buffer[] = []
    for await (const chunk of download.stream) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array),
      )
    }
    expect(Buffer.concat(chunks).equals(bytes.subarray(4, 14))).toBe(true)
  })

  it('rejects ranged download for missing blob', async () => {
    await expect(
      storage.downloadRange({
        blobName: validBlobName(),
        offset: 0,
        count: 1,
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportNotFoundException)
  })

  it('rejects invalid range offsets', async () => {
    const blobName = validBlobName()
    await storage.store({
      bytes: webmBytes(20),
      blobName,
      mimeType: 'audio/webm',
    })

    await expect(
      storage.downloadRange({ blobName, offset: -1, count: 1 }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStorageFailedException)

    await expect(
      storage.downloadRange({ blobName, offset: 999, count: 1 }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStorageFailedException)
  })

  it('fails the next store when setFailNextStore is enabled', async () => {
    const blobName = validBlobName()
    storage.setFailNextStore(true)

    await expect(
      storage.store({
        bytes: webmBytes(),
        blobName,
        mimeType: 'audio/webm',
      }),
    ).rejects.toBeInstanceOf(RouteVoiceReportStorageFailedException)

    await storage.store({
      bytes: webmBytes(),
      blobName,
      mimeType: 'audio/webm',
    })
    expect(storage.has(blobName)).toBe(true)
  })

  it('rejects invalid blob path shapes', () => {
    expect(() =>
      storage.store({
        bytes: webmBytes(),
        blobName: 'public/jan-courier/audio.webm',
        mimeType: 'audio/webm',
      }),
    ).toThrow()
  })

  it('clear removes all blobs', async () => {
    const blobName = validBlobName()
    await storage.store({
      bytes: webmBytes(),
      blobName,
      mimeType: 'audio/webm',
    })
    storage.clear()
    expect(storage.has(blobName)).toBe(false)
  })
})
