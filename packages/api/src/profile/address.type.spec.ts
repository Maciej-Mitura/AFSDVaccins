import { normalizeAddress } from './address.type'

describe('normalizeAddress', () => {
  it('trims fields and defaults country to BE', () => {
    expect(
      normalizeAddress({
        street: '  Kerkstraat ',
        houseNumber: ' 12A ',
        postalCode: '8000',
        city: ' Brugge ',
      }),
    ).toEqual({
      street: 'Kerkstraat',
      houseNumber: '12A',
      postalCode: '8000',
      city: 'Brugge',
      country: 'BE',
    })
  })

  it('uppercases provided country codes', () => {
    expect(
      normalizeAddress({
        street: 'Kerkstraat',
        houseNumber: '1',
        postalCode: '9000',
        city: 'Gent',
        country: 'be',
      }).country,
    ).toBe('BE')
  })
})
