import { useTranslation } from 'react-i18next'

/** Shown only for female operators: whether shift planning may give them night shifts. */
export function NightShiftConsentField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation('setup')
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{t('staff.nightShiftConsent')}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{t('staff.nightShiftConsentHint')}</span>
      </span>
    </label>
  )
}
