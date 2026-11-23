import type { TFunction } from 'i18next'

export function ownerStatusLabel(t: TFunction<['superadmin', 'common']>, status: string): string {
  if (status === 'ACTIVE') return t('owners.statusActive')
  if (status === 'INACTIVE') return t('owners.statusInactive')
  return status.toLowerCase()
}
