import {
  assertVaccineImageProvidersAllowedForEnv,
  resolveVaccineImageProviderMode,
} from './vaccine-image-provider.selection'

describe('vaccine image provider selection', () => {
  it('defaults to fake outside production and azure in production', () => {
    expect(resolveVaccineImageProviderMode(undefined, 'development')).toBe(
      'fake',
    )
    expect(resolveVaccineImageProviderMode(undefined, 'test')).toBe('fake')
    expect(resolveVaccineImageProviderMode(undefined, 'production')).toBe(
      'azure',
    )
  })

  it('rejects silent fake activation in production', () => {
    expect(() =>
      resolveVaccineImageProviderMode('fake', 'production'),
    ).toThrow(/cannot be activated in production/)

    expect(() =>
      assertVaccineImageProvidersAllowedForEnv('fake', 'azure', 'production'),
    ).toThrow(/cannot be activated in production/)
  })

  it('allows explicit azure in production and fake in development', () => {
    expect(resolveVaccineImageProviderMode('azure', 'production')).toBe(
      'azure',
    )
    expect(resolveVaccineImageProviderMode('fake', 'development')).toBe('fake')
  })
})
