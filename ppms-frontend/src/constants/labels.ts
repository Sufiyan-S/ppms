import type { UserRole } from '../types/auth'
import { FUEL_LABELS } from './fuel'

const CODE_LABELS: Record<string, string> = {
  ...FUEL_LABELS,
  UPI: 'UPI',
  CNG: 'CNG',
  GST: 'GST',
  LITRE: 'Litre',
  ML: 'ml',
  KG: 'kg',
  PIECE: 'Piece',
  SUPER_ADMIN: 'Super admin',
}

/** Turns a backend enum code such as PENDING_APPROVAL into text for people: "Pending approval". */
export function codeLabel(code: string | null | undefined, fallback = '—'): string {
  if (!code) return fallback
  const known = CODE_LABELS[code]
  if (known) return known
  const words = code.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function roleLabel(role: UserRole | undefined): string {
  return codeLabel(role, '')
}
