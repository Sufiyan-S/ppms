import { z } from 'zod'
import type { TFunction } from 'i18next'

// ── Validation schemas ────────────────────────────────────────────────────────

type SuperAdminT = TFunction<'superadmin'>

export function addPumpSchema(t: SuperAdminT) {
  return z.object({
    pumpName:      z.string().min(1, t('validation.pumpNameRequired')),
    pumpAddress:   z.string().min(1, t('validation.pumpAddressRequired')),
    maxDuCount: z.coerce.number().int().min(1, t('validation.atLeastOne')).max(20, t('validation.atMostTwenty')),
  })
}

export type AddPumpFormData = z.infer<ReturnType<typeof addPumpSchema>>

export type AddPumpFormInput = z.input<ReturnType<typeof addPumpSchema>>

export function editPumpSchema(t: SuperAdminT) {
  return z.object({
    pumpName:    z.string().min(1, t('validation.pumpNameRequired')),
    pumpAddress: z.string().min(1, t('validation.pumpAddressRequired')),
  })
}

export type EditPumpFormData = z.infer<ReturnType<typeof editPumpSchema>>

export type EditPumpFormInput = z.input<ReturnType<typeof editPumpSchema>>

export function onboardSchema(t: SuperAdminT) {
  return z.object({
    fullName: z.string().min(1, t('validation.fullNameRequired')),
    phoneNumber: z.string().length(10, t('validation.phoneLength')).regex(/^\d+$/, t('validation.digitsOnly')),
    password: z.string()
      .min(8, t('validation.passwordLength'))
      .regex(/[A-Z]/, t('validation.passwordUppercase'))
      .regex(/[a-z]/, t('validation.passwordLowercase'))
      .regex(/\d/, t('validation.passwordDigit')),
    pumpName: z.string().min(1, t('validation.pumpNameRequired')),
    pumpAddress: z.string().min(1, t('validation.pumpAddressRequired')),
    maxDuCount: z.coerce.number().int().min(1, t('validation.atLeastOneDu')).max(20, t('validation.atMostTwentyDus')),
  })
}

export type OnboardFormData = z.infer<ReturnType<typeof onboardSchema>>

export type OnboardFormInput = z.input<ReturnType<typeof onboardSchema>>
