import { useId } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NumericInput } from '../../../components/NumericInput'
import { formatCurrency } from '../../../utils/format'
import { formatNumberIn } from '../../../i18n/format'
import { formatUnits } from './closeShiftTotals'

export function Section({ label, title, optional = false, children }: {
  label: string; title: string; optional?: boolean; children: React.ReactNode
}) {
  const { t } = useTranslation(['shifts', 'common'])
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="bg-primary text-on-primary text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {label}
        </span>
        <h3 id={headingId} className="text-sm font-semibold text-ink">{title}</h3>
        {optional && <span className="text-xs text-ink-3">{t('common:fields.optionalSuffix')}</span>}
      </div>
      {children}
    </section>
  )
}

export function ReadingField({ label, startValue, soldUnits, pricePerUnit, value, onChange, unitLabel, isInvalid, noChange, onNoChangeToggle, focusOnOpen = false }: {
  label: string; startValue: number; soldUnits: number; pricePerUnit: number;
  value: string; onChange: (v: string) => void; unitLabel: string; isInvalid?: boolean
  noChange?: boolean; onNoChangeToggle?: () => void; focusOnOpen?: boolean
}) {
  const { t } = useTranslation(['shifts', 'common'])
  const resultId = useId()
  const start = `${formatNumberIn(startValue, { maximumFractionDigits: 3 })} ${unitLabel}`

  let result: ReactNode = null
  if (noChange) {
    result = <span className="text-ink-3">{t('close.fields.unchanged', { unit: unitLabel })}</span>
  } else if (isInvalid) {
    result = <span role="alert" className="font-medium text-bad">{t('close.fields.belowStart', { start: startValue })}</span>
  } else if (value !== '') {
    result = (
      <span className="tabular-nums text-ink-2">
        = {formatUnits(soldUnits, unitLabel)} × {formatCurrency(pricePerUnit)} ={' '}
        <span className="font-semibold text-ink">{formatCurrency(soldUnits * pricePerUnit)}</span>
      </span>
    )
  }

  return (
    <div className="ui-reading-row">
      <div className="ui-reading-row__name">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3 tabular-nums">
          {t('close.fields.startReading', { reading: start })} · {formatCurrency(pricePerUnit)}/{unitLabel}
        </span>
      </div>
      <div className="ui-reading-row__input">
        <NumericInput aria-label={t('close.fields.endReadingAria', { label })} step="0.001" min="0" required value={value}
          disabled={noChange}
          data-autofocus={focusOnOpen || undefined}
          unit={unitLabel}
          aria-invalid={isInvalid || undefined}
          aria-describedby={result ? resultId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <label className="ui-inline-check ui-reading-row__check">
        <input type="checkbox" checked={noChange ?? false} onChange={onNoChangeToggle} />
        <span>{t('close.fields.noChange')}</span>
      </label>
      <p id={resultId} className="ui-reading-row__result text-xs">{result}</p>
    </div>
  )
}

export function PaymentField({ label, value, onChange, action }: {
  label: string; value: string; onChange: (v: string) => void
  /** A small button shown at the end of the label row. */
  action?: ReactNode
}) {
  const inputId = useId()
  return (
    <div className="flex flex-col justify-end">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <label htmlFor={inputId} className="ui-label mb-0">{label}</label>
        {action}
      </div>
      <NumericInput id={inputId} step="0.01" min="0" value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
