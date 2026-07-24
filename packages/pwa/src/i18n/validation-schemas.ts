import { SelfRegistrationRole } from '@vaccin-delivery/types'
import * as z from 'zod'

type TranslateFn = (key: string) => string

/**
 * Zod schema factories — call inside computed() / setup so messages
 * reflect the current locale after language switching (no module-load capture).
 */

export function createLoginSchema(t: TranslateFn) {
  return z.object({
    email: z.string().email(t('validation.email.invalid')),
    password: z.string().min(8, t('validation.password.minLength')),
  })
}

export function createRegisterSchema(t: TranslateFn) {
  return z.object({
    firstName: z.string().min(2, t('validation.firstName.minLength')),
    lastName: z.string().min(2, t('validation.lastName.minLength')),
    email: z.string().email(t('validation.email.invalid')),
    password: z.string().min(8, t('validation.password.minLength')),
    role: z.enum(
      [SelfRegistrationRole.Apotheker, SelfRegistrationRole.Bezorger],
      { message: t('validation.role.required') },
    ),
  })
}

export function createForgotPasswordSchema(t: TranslateFn) {
  return z.object({
    email: z.string().email(t('validation.email.invalid')),
  })
}

export function createNameFieldsSchema(t: TranslateFn) {
  return z.object({
    firstName: z.string().min(2, t('validation.firstName.minLength')),
    lastName: z.string().min(2, t('validation.lastName.minLength')),
  })
}

export function createRegistrationRoleSchema(t: TranslateFn) {
  return createNameFieldsSchema(t).extend({
    role: z.enum(
      [SelfRegistrationRole.Apotheker, SelfRegistrationRole.Bezorger],
      { message: t('validation.role.required') },
    ),
  })
}

export function createApothekerProfileSchema(t: TranslateFn) {
  return createNameFieldsSchema(t).extend({
    pharmacyName: z
      .string()
      .trim()
      .min(1, t('validation.pharmacyName.required'))
      .max(120),
    street: z.string().trim().min(1, t('validation.street.required')).max(120),
    houseNumber: z
      .string()
      .trim()
      .min(1, t('validation.houseNumber.required'))
      .max(20),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, t('validation.postalCode.belgium')),
    city: z.string().trim().min(1, t('validation.city.required')).max(100),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, t('validation.countryCode.format')),
  })
}

export function createApothekerProfileSchemaOptionalCountry(t: TranslateFn) {
  return createNameFieldsSchema(t).extend({
    pharmacyName: z
      .string()
      .trim()
      .min(1, t('validation.pharmacyName.required'))
      .max(120),
    street: z.string().trim().min(1, t('validation.street.required')).max(120),
    houseNumber: z
      .string()
      .trim()
      .min(1, t('validation.houseNumber.required'))
      .max(20),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, t('validation.postalCode.belgium')),
    city: z.string().trim().min(1, t('validation.city.required')).max(100),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, t('validation.countryCode.format'))
      .optional()
      .or(z.literal('')),
  })
}

export function createBezorgerProfileSchema(t: TranslateFn) {
  return createNameFieldsSchema(t).extend({
    displayName: z
      .string()
      .trim()
      .min(1, t('validation.displayName.required'))
      .max(120),
    vehicleLabel: z.string().trim().max(120).optional().or(z.literal('')),
  })
}
