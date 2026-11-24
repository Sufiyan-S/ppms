import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, X } from 'lucide-react'
import { SearchableSelect } from '../../../components/SearchableSelect'
import type { SelectOption } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { SORT_ORDER_OPTS, shiftLength } from './shiftDefinitionRows'
import type { ShiftRow } from './shiftDefinitionRows'

/** The row's length, "8h" or "8h 30m", with "ends next day" for a night shift past midnight, or the mistake to fix. */
function RowLength({ row, id }: { row: ShiftRow; id: string }) {
  const { t } = useTranslation(['setup', 'common'])
  const length = shiftLength(row)
  if (!length) {
    return <p id={id} className="ui-error-text mt-0">{t('shiftDefs.form.endsBeforeStartShort')}</p>
  }
  const duration = length.minutes === 0
    ? t('shiftDefs.form.hours', { hours: length.hours })
    : t('common:duration.hoursMinutes', { hours: length.hours, minutes: length.minutes })
  return (
    <p id={id} className="text-xs text-ink-3 tabular-nums">
      {length.endsNextDay ? t('shiftDefs.form.lengthNextDay', { duration }) : duration}
    </p>
  )
}

interface Props {
  row: ShiftRow
  startOptions: SelectOption[]
  endOptions: SelectOption[]
  onChange: (patch: Partial<ShiftRow>) => void
  /** Absent while it is the only row, which cannot be removed. */
  onRemove?: () => void
}

/** One shift of a new schedule as a card: name, start and end, display order and the Night tick, with its length. */
export function ShiftRowCard({ row, startOptions, endOptions, onChange, onRemove }: Props) {
  const { t } = useTranslation('setup')
  const idPrefix = useId()
  const lengthId = `${idPrefix}-length`
  const startLabelId = `${idPrefix}-start`
  const endLabelId = `${idPrefix}-end`
  const orderLabelId = `${idPrefix}-order`

  return (
    <li className="ui-card-plain space-y-3 p-3">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1">
          <span className="ui-label">{t('shiftDefs.form.shiftName')}</span>
          <input aria-describedby={lengthId} placeholder={t('shiftDefs.form.shiftNamePlaceholder')} value={row.name}
            onChange={e => onChange({ name: e.target.value })} className="w-full text-sm" />
        </label>
        {onRemove && (
          <IconButton onClick={onRemove} className="ui-btn ui-btn-ghost mt-6 text-ink-3"
            label={t('shiftDefs.form.removeRow')} icon={<X size={16} strokeWidth={2} />} />
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(6.5rem,7.5rem)]">
        <div className="min-w-0">
          <span id={startLabelId} className="ui-label">{t('shiftDefs.form.startTime')}</span>
          <SearchableSelect aria-labelledby={startLabelId} value={row.startTime} onChange={v => onChange({ startTime: v })}
            options={startOptions} size="sm" className="min-w-0" />
        </div>
        <ArrowRight size={14} strokeWidth={2} aria-hidden="true" className="mb-3 text-ink-3" />
        <div className="min-w-0">
          <span id={endLabelId} className="ui-label">{t('shiftDefs.form.endTime')}</span>
          <SearchableSelect aria-labelledby={endLabelId} value={row.endTime} onChange={v => onChange({ endTime: v })}
            options={endOptions} size="sm" className="min-w-0" />
        </div>
        <div className="col-span-full min-w-0 sm:col-span-1">
          <span id={orderLabelId} className="ui-label">{t('shiftDefs.form.displayOrder')}</span>
          <SearchableSelect aria-labelledby={orderLabelId} value={String(row.sortOrder)} onChange={v => onChange({ sortOrder: Number(v) })}
            options={SORT_ORDER_OPTS} size="sm" className="min-w-0" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RowLength row={row} id={lengthId} />
        <label className="ui-inline-check">
          <input type="checkbox" checked={row.isNightShift} onChange={e => onChange({ isNightShift: e.target.checked })} />
          <span>{t('shiftDefs.night')}</span>
        </label>
      </div>
    </li>
  )
}
