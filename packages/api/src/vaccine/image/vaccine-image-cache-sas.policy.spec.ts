import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CacheKeys } from '../../common/cache/cache-keys'
import { VaccineImage } from './vaccine-image.embed'

describe('vaccine image cache / SAS URL policy', () => {
  it('documents that catalogue cache keys must not hold temporary read URLs', () => {
    const cacheKeysSource = readFileSync(
      join(__dirname, '../../common/cache/cache-keys.ts'),
      'utf8',
    )

    expect(CacheKeys.vaccinesActive()).toBe('vaccines:active')
    expect(CacheKeys.vaccinesAll()).toBe('vaccines:all')
    expect(cacheKeysSource).toMatch(/Temporary read URLs/)
    expect(cacheKeysSource).toMatch(/must NEVER/)
    expect(cacheKeysSource).toMatch(/expired URLs trapped/)
  })

  it('VaccineImage persistence type has no imageUrl property to cache', () => {
    const image = new VaccineImage()
    expect('imageUrl' in image).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(image, 'imageUrl')).toBe(false)
  })
})
