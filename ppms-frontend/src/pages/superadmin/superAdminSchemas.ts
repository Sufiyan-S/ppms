import { z } from 'zod'

// ── Validation schemas ────────────────────────────────────────────────────────

export const addPumpSchema = z.object({
  pumpName:      z.string().min(1, 'Pump name is required'),
  pumpAddress:   z.string().min(1, 'Pump address is required'),
  maxDuCount: z.coerce.number().int().min(1, 'Must be at least 1').max(20, 'Cannot exceed 20'),
})

export type AddPumpFormData = z.infer<typeof addPumpSchema>

export type AddPumpFormInput = z.input<typeof addPumpSchema>

export const editPumpSchema = z.object({
  pumpName:    z.string().min(1, 'Pump name is required'),
  pumpAddress: z.string().min(1, 'Pump address is required'),
})

export type EditPumpFormData = z.infer<typeof editPumpSchema>

export type EditPumpFormInput = z.input<typeof editPumpSchema>

export const onboardSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phoneNumber: z.string().length(10, 'Phone number must be exactly 10 digits').regex(/^\d+$/, 'Must be digits only'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/\d/, 'Must contain at least one digit'),
  pumpName: z.string().min(1, 'Pump name is required'),
  pumpAddress: z.string().min(1, 'Pump address is required'),
  maxDuCount: z.coerce.number().int().min(1, 'Must be at least 1 DU').max(20, 'Cannot exceed 20 DUs'),
})

export type OnboardFormData = z.infer<typeof onboardSchema>

export type OnboardFormInput = z.input<typeof onboardSchema>
