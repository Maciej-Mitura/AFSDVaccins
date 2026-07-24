/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  __resetAppI18nForTests,
  createLoginSchema,
  translate,
} from '@/i18n'
import { __resetLocaleLoaderForTests } from '@/i18n/locale-loader'
import { createTestI18n } from '@/i18n/test-utils'
import { useLanguage } from '@/composables/useLanguage'

describe('validation schema locale sensitivity', () => {
  beforeEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
    createTestI18n('nl')
  })

  afterEach(() => {
    __resetLocaleLoaderForTests()
    __resetAppI18nForTests()
  })

  it('createLoginSchema messages differ between nl and en after setLocale', async () => {
    const nlSchema = createLoginSchema(key => translate(key))
    const nlEmail = nlSchema.safeParse({ email: 'bad', password: 'short' })
    expect(nlEmail.success).toBe(false)
    if (nlEmail.success) return

    const nlEmailMsg = nlEmail.error.issues.find(i => i.path[0] === 'email')
      ?.message
    const nlPasswordMsg = nlEmail.error.issues.find(
      i => i.path[0] === 'password',
    )?.message

    expect(nlEmailMsg).toBe(translate('validation.email.invalid'))
    expect(nlPasswordMsg).toBe(translate('validation.password.minLength'))

    const { setLocale } = useLanguage()
    await setLocale('en')

    const enSchema = createLoginSchema(key => translate(key))
    const enResult = enSchema.safeParse({ email: 'bad', password: 'short' })
    expect(enResult.success).toBe(false)
    if (enResult.success) return

    const enEmailMsg = enResult.error.issues.find(i => i.path[0] === 'email')
      ?.message
    const enPasswordMsg = enResult.error.issues.find(
      i => i.path[0] === 'password',
    )?.message

    expect(enEmailMsg).toBe(translate('validation.email.invalid'))
    expect(enPasswordMsg).toBe(translate('validation.password.minLength'))
    expect(enEmailMsg).not.toBe(nlEmailMsg)
    expect(enPasswordMsg).not.toBe(nlPasswordMsg)
  })
})
