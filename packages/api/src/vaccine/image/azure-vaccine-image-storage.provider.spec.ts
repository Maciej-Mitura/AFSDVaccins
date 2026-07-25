import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  RestError,
  SASProtocol,
} from '@azure/storage-blob'

import { AzureVaccineImageStorageProvider } from './azure-vaccine-image-storage.provider'
import { parseAzureStorageSharedKeyCredential } from './azure-storage-connection'
import {
  VaccineImageBlobAlreadyExistsException,
  VaccineImageBlobNotFoundException,
  VaccineImageStorageConfigurationException,
  VaccineImageStorageKeyInvalidException,
  VaccineImageStoragePermissionDeniedException,
  VaccineImageStorageUnavailableException,
} from './vaccine-image-storage.exceptions'
import { VaccineImageStorageProviderId } from './vaccine-image-storage-provider.enum'

/** Well-known Azurite account key — used only in unit tests, never against real Azure. */
const TEST_CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;EndpointSuffix=core.windows.net'

const CONTAINER = 'vaccine-images'
const STORAGE_KEY = 'vaccines/507f1f77bcf86cd799439011/image.jpg'

describe('AzureVaccineImageStorageProvider', () => {
  let uploadData: jest.Mock
  let deleteIfExists: jest.Mock
  let exists: jest.Mock
  let getProperties: jest.Mock
  let getBlockBlobClient: jest.Mock
  let fromConnectionStringSpy: jest.SpyInstance

  const blobUrl = `https://devstoreaccount1.blob.core.windows.net/${CONTAINER}/${STORAGE_KEY}`

  function createProvider(
    ttlSeconds = 900,
  ): AzureVaccineImageStorageProvider {
    return AzureVaccineImageStorageProvider.fromConfig({
      connectionString: TEST_CONNECTION_STRING,
      containerName: CONTAINER,
      readUrlTtlSeconds: ttlSeconds,
    })
  }

  beforeEach(() => {
    uploadData = jest.fn().mockResolvedValue(undefined)
    deleteIfExists = jest.fn().mockResolvedValue({ succeeded: true })
    exists = jest.fn().mockResolvedValue(true)
    getProperties = jest.fn().mockResolvedValue({})
    getBlockBlobClient = jest.fn().mockReturnValue({
      uploadData,
      deleteIfExists,
      exists,
      url: blobUrl,
    })

    fromConnectionStringSpy = jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue({
        getContainerClient: jest.fn().mockReturnValue({
          getBlockBlobClient,
          getProperties,
        }),
      } as unknown as BlobServiceClient)
  })

  afterEach(() => {
    fromConnectionStringSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('constructs BlobServiceClient once from the connection string', () => {
    createProvider()
    expect(fromConnectionStringSpy).toHaveBeenCalledTimes(1)
    expect(fromConnectionStringSpy).toHaveBeenCalledWith(TEST_CONNECTION_STRING)
  })

  it('rejects connection strings without an AccountKey at configuration time', () => {
    expect(() =>
      AzureVaccineImageStorageProvider.fromConfig({
        connectionString:
          'BlobEndpoint=https://example.blob.core.windows.net/;SharedAccessSignature=sv=2021-08-06&ss=b&srt=sco&sp=r',
        containerName: CONTAINER,
        readUrlTtlSeconds: 900,
      }),
    ).toThrow(VaccineImageStorageConfigurationException)
  })

  it('stores the exact bytes and content type without overwrite', async () => {
    const provider = createProvider()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

    const result = await provider.store({
      bytes,
      storageKey: STORAGE_KEY,
      mimeType: 'image/png',
      metadata: { vaccineId: '507f1f77bcf86cd799439011' },
    })

    expect(result).toEqual({
      provider: VaccineImageStorageProviderId.AZURE_BLOB,
      storageKey: STORAGE_KEY,
    })
    expect(uploadData).toHaveBeenCalledTimes(1)
    const uploadCall = uploadData.mock.calls[0] as unknown as [
      Buffer,
      {
        blobHTTPHeaders: { blobContentType: string }
        conditions: { ifNoneMatch: string }
        metadata: Record<string, string>
      },
    ]
    expect(uploadCall[0]).toBe(bytes)
    expect(uploadCall[1]).toEqual(
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: 'image/png' },
        conditions: { ifNoneMatch: '*' },
        metadata: { vaccineId: '507f1f77bcf86cd799439011' },
      }),
    )
  })

  it('prevents accidental overwrite when the blob already exists', async () => {
    uploadData.mockRejectedValue(
      new RestError('Condition Not Met', {
        statusCode: 409,
        code: 'ConditionNotMet',
      }),
    )
    const provider = createProvider()

    await expect(
      provider.store({
        bytes: Buffer.from('x'),
        storageKey: STORAGE_KEY,
        mimeType: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(VaccineImageBlobAlreadyExistsException)
  })

  it('rejects invalid or empty storage keys', async () => {
    const provider = createProvider()

    await expect(
      provider.store({
        bytes: Buffer.from('x'),
        storageKey: '',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(VaccineImageStorageKeyInvalidException)

    await expect(
      provider.store({
        bytes: Buffer.from('x'),
        storageKey: '../escape.jpg',
        mimeType: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(VaccineImageStorageKeyInvalidException)

    await expect(provider.delete('')).rejects.toBeInstanceOf(
      VaccineImageStorageKeyInvalidException,
    )
    await expect(
      provider.createReadUrl({ storageKey: '  ' }),
    ).rejects.toBeInstanceOf(VaccineImageStorageKeyInvalidException)
  })

  it('deletes idempotently when the blob is already missing', async () => {
    deleteIfExists.mockResolvedValue({ succeeded: false })
    const provider = createProvider()

    await expect(provider.delete(STORAGE_KEY)).resolves.toBeUndefined()
    expect(deleteIfExists).toHaveBeenCalledTimes(1)
  })

  it('does not suppress permission or network failures on delete', async () => {
    const provider = createProvider()

    deleteIfExists.mockRejectedValueOnce(
      new RestError('Forbidden', { statusCode: 403, code: 'AuthorizationFailure' }),
    )
    await expect(provider.delete(STORAGE_KEY)).rejects.toBeInstanceOf(
      VaccineImageStoragePermissionDeniedException,
    )

    deleteIfExists.mockRejectedValueOnce(
      Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
    )
    await expect(provider.delete(STORAGE_KEY)).rejects.toBeInstanceOf(
      VaccineImageStorageUnavailableException,
    )
  })

  it('createReadUrl builds a blob-specific HTTPS read-only SAS with configured TTL', async () => {
    const ttlSeconds = 600
    const provider = createProvider(ttlSeconds)
    const before = Date.now()

    const url = await provider.createReadUrl({ storageKey: STORAGE_KEY })
    const after = Date.now()

    expect(url.startsWith(`${blobUrl}?`)).toBe(true)
    expect(url).toMatch(/^https:\/\//)

    const parsed = new URL(url)
    expect(parsed.protocol).toBe('https:')
    expect(parsed.pathname).toContain(STORAGE_KEY)
    expect(parsed.searchParams.get('sp')).toBe('r')
    expect(parsed.searchParams.get('spr')).toBe('https')
    expect(parsed.searchParams.has('sig')).toBe(true)

    const se = parsed.searchParams.get('se')
    expect(se).toBeTruthy()
    const expiresAt = Date.parse(se as string)
    expect(expiresAt).toBeGreaterThanOrEqual(before + ttlSeconds * 1000 - 2_000)
    expect(expiresAt).toBeLessThanOrEqual(after + ttlSeconds * 1000 + 2_000)

    const st = parsed.searchParams.get('st')
    expect(st).toBeTruthy()
    const startsAt = Date.parse(st as string)
    expect(startsAt).toBeLessThanOrEqual(before)

    // Read-only: permissions must not include write/create/add/list/delete.
    const permissions = BlobSASPermissions.parse(
      parsed.searchParams.get('sp') as string,
    )
    expect(permissions.read).toBe(true)
    expect(permissions.write).toBe(false)
    expect(permissions.create).toBe(false)
    expect(permissions.add).toBe(false)
    expect(permissions.delete).toBe(false)
  })

  it('createReadUrl fails explicitly when the blob is missing', async () => {
    exists.mockResolvedValue(false)
    const provider = createProvider()

    await expect(
      provider.createReadUrl({ storageKey: STORAGE_KEY }),
    ).rejects.toBeInstanceOf(VaccineImageBlobNotFoundException)
  })

  it('does not leak credentials or SAS query strings in mapped errors', async () => {
    uploadData.mockRejectedValue(
      new RestError(
        `Authorization failure for ${TEST_CONNECTION_STRING} sig=supersecret`,
        { statusCode: 403, code: 'AuthorizationFailure' },
      ),
    )
    const provider = createProvider()

    try {
      await provider.store({
        bytes: Buffer.from('x'),
        storageKey: STORAGE_KEY,
        mimeType: 'image/jpeg',
      })
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(VaccineImageStoragePermissionDeniedException)
      const message = String(error)
      expect(message).not.toContain('AccountKey')
      expect(message).not.toContain(TEST_CONNECTION_STRING)
      expect(message).not.toContain('sig=')
      expect(message).not.toContain('supersecret')
    }
  })
})

describe('parseAzureStorageSharedKeyCredential', () => {
  it('requires AccountName and AccountKey', () => {
    expect(() =>
      parseAzureStorageSharedKeyCredential(
        'DefaultEndpointsProtocol=https;AccountName=only;',
      ),
    ).toThrow(/AccountKey/)
  })
})

describe('generateBlobSASQueryParameters protocol', () => {
  it('uses HTTPS-only protocol constant from the SDK', () => {
    expect(SASProtocol.Https).toBe('https')
    const credential = parseAzureStorageSharedKeyCredential(TEST_CONNECTION_STRING)
    const sas = generateBlobSASQueryParameters(
      {
        containerName: CONTAINER,
        blobName: STORAGE_KEY,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(Date.now() - 60_000),
        expiresOn: new Date(Date.now() + 900_000),
        protocol: SASProtocol.Https,
      },
      credential,
    ).toString()
    expect(sas).toContain('spr=https')
    expect(sas).toContain('sp=r')
  })
})
