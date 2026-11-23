import { translateKey } from '../i18n'
import { FUEL_LABELS } from './fuel'

const CODE_LABELS: Record<string, string> = {
  ...FUEL_LABELS,
  OK: 'OK',
  UPI: 'UPI',
  CNG: 'CNG',
  GST: 'GST',
  LITRE: 'Litre',
  ML: 'ml',
  KG: 'kg',
  PIECE: 'Piece',
  SUPER_ADMIN: 'Super admin',
}

function englishCodeLabel(code: string): string {
  const known = CODE_LABELS[code]
  if (known) return known
  const words = code.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Turns a backend enum code such as PENDING_APPROVAL into text for people: "Pending approval",
 * or its enums.json translation in Hindi or Marathi.
 */
export function codeLabel(code: string | null | undefined, fallback = '—'): string {
  if (!code) return fallback
  return translateKey(`enums:${code}`, { defaultValue: englishCodeLabel(code) })
}

export function roleLabel(role: string | undefined): string {
  return codeLabel(role, '')
}
