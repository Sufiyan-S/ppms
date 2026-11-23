import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { CreateShiftDefinitionRequest } from '../../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { subtractOneMinute, TIME_OPTS, SORT_ORDER_OPTS, defaultRows, shiftLength } from './shiftDefinitionRows'
import type { ShiftRow } from './shiftDefinitionRows'

/** Which date field a validation message belongs under; anything else is shown above the buttons. */
interface FormErrors {
  startDate?: string
  endDate?: string
  form?: string
}

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

export function CreateShiftBatchForm({ pumpId, onClose }: { pumpId: number; onClose: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const qc = useQueryClient()
  const titleId = useId()
  const rowIdPrefix = useId()
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [hasEndDate, setHasEndDate] = useState(false)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [rows, setRows] = useState<ShiftRow[]>(defaultRows)
  const [errors, setErrors] = useState<FormErrors>({})

  const createMutation = useMutation({
    mutationFn: (reqs: CreateShiftDefinitionRequest[]) =>
      shiftDefinitionApi.createBatch(pumpId, reqs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      onClose()
    },
    onError: (err) => {
      setErrors({ form: parseApiError(err, t('shiftDefs.form.saveFailed')) })
    },
  })

  const addRow = () => {
    if (rows.length >= 4) return
    setRows(prev => [
      ...prev,
      { name: '', startTime: '06:00', endTime: '14:00', isNightShift: false, sortOrder: prev.length + 1 },
    ])
  }

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const updateRow = (idx: number, patch: Partial<ShiftRow>) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const handleSubmit = () => {
    setErrors({})
    if (!effectiveFrom) { setErrors({ startDate: t('shiftDefs.form.startRequired') }); return }
    if (hasEndDate && !effectiveTo) { setErrors({ endDate: t('shiftDefs.form.endRequired') }); return }
    if (hasEndDate && effectiveTo <= effectiveFrom) { setErrors({ endDate: t('shiftDefs.form.endAfterStart') }); return }
    if (rows.some(r => !r.name.trim())) { setErrors({ form: t('shiftDefs.form.nameRequired') }); return }

    // Guard: only the night shift is allowed to cross midnight (endTime < startTime).
    // If a non-night shift has end < start, the user almost certainly picked AM instead of PM.
    const badRow = rows.find(r => !r.isNightShift && r.endTime <= r.startTime)
    if (badRow) {
      setErrors({ form: t('shiftDefs.form.endsBeforeStart', { name: badRow.name }) })
      return
    }

    // End times are exclusive upper bounds: store "end - 1 min" so consecutive shifts
    // can share a boundary (e.g., Night ends displayed as 9:00 AM, Morning starts at 9:00 AM).
    const resolvedEffectiveTo = hasEndDate ? effectiveTo : null
    const reqs: CreateShiftDefinitionRequest[] = rows.map(r => ({
      name: r.name.trim(),
      startTime: r.startTime,
      endTime: subtractOneMinute(r.endTime),
      isNightShift: r.isNightShift,
      sortOrder: r.sortOrder,
      effectiveFrom,
      effectiveTo: resolvedEffectiveTo,
    }))
    createMutation.mutate(reqs)
  }

  return (
    <section aria-labelledby={titleId} className="ui-card-plain p-4 space-y-4">
      <div>
        <h3 id={titleId} className="text-sm font-semibold text-ink">{t('shiftDefs.form.title')}</h3>
        <p className="mt-0.5 text-xs text-ink-3">{t('shiftDefs.form.overlapHint')}</p>
      </div>

      <FormGrid>
        <FormField label={t('shiftDefs.form.startDate')} error={errors.startDate}>
          <input
            type="date"
            value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)}
            className="text-sm"
          />
        </FormField>
        <div>
          <FormField
            label={t('shiftDefs.form.endDate')}
            error={errors.endDate}
            help={hasEndDate ? undefined : t('shiftDefs.form.openEnded')}
          >
            <input
              type="date"
              value={effectiveTo}
              onChange={e => setEffectiveTo(e.target.value)}
              disabled={!hasEndDate}
              min={effectiveFrom || undefined}
              className="text-sm disabled:bg-bg disabled:text-ink-3"
            />
          </FormField>
          <label className="ui-inline-check">
            <input
              type="checkbox"
              checked={hasEndDate}
              onChange={e => { setHasEndDate(e.target.checked); if (!e.target.checked) setEffectiveTo('') }}
            />
            <span>{t('shiftDefs.form.setEndDate')}</span>
          </label>
        </div>
      </FormGrid>

      <div className="space-y-3">
        <div aria-hidden="true" className="hidden gap-2 md:grid md:grid-cols-[minmax(0,12rem)_minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)_minmax(6.5rem,7.5rem)_auto]">
          <span className="ui-label mb-0">{t('shiftDefs.form.shiftName')}</span>
          <span className="ui-label mb-0">{t('shiftDefs.form.startTime')}</span>
          <span />
          <span className="ui-label mb-0">{t('shiftDefs.form.endTime')}</span>
          <span className="ui-label mb-0">{t('shiftDefs.form.displayOrder')}</span>
          <span />
        </div>
        {rows.map((row, idx) => {
          const otherRows = rows.filter((_, i) => i !== idx)
          // Only block times used by rows that have been named — unnamed rows have default
          // placeholder times that should not restrict other rows' options.
          const configuredOtherRows = otherRows.filter(r => r.name.trim() !== '')
          const usedStarts = new Set(configuredOtherRows.map(r => r.startTime))
          const usedEnds   = new Set(configuredOtherRows.map(r => r.endTime))
          const startOpts  = TIME_OPTS.filter(o => !usedStarts.has(o.value))
          const endOpts    = TIME_OPTS.filter(o => !usedEnds.has(o.value))
          const lengthId = `${rowIdPrefix}-length-${idx}`
          return (
          <div key={idx} className="space-y-1">
            <div className="grid gap-2 items-center md:grid-cols-[minmax(0,12rem)_minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)_minmax(6.5rem,7.5rem)_auto]">
              <input aria-label={t('shiftDefs.form.shiftName')}
                aria-describedby={lengthId}
                placeholder={t('shiftDefs.form.shiftNamePlaceholder')}
                value={row.name}
                onChange={e => updateRow(idx, { name: e.target.value })}
                className="min-w-0 text-sm md:max-w-48"
              />
              <SearchableSelect label={t('shiftDefs.form.startTime')}
                value={row.startTime}
                onChange={v => updateRow(idx, { startTime: v })}
                options={startOpts}
                size="sm"
                className="min-w-0"
              />
              <span aria-hidden="true" className="text-xs text-ink-3">→</span>
              <SearchableSelect label={t('shiftDefs.form.endTime')}
                value={row.endTime}
                onChange={v => updateRow(idx, { endTime: v })}
                options={endOpts}
                size="sm"
                className="min-w-0"
              />
              <SearchableSelect label={t('shiftDefs.form.displayOrder')}
                value={String(row.sortOrder)}
                onChange={v => updateRow(idx, { sortOrder: Number(v) })}
                options={SORT_ORDER_OPTS}
                size="sm"
                className="min-w-0"
              />
              <div className="flex items-center gap-1.5">
                <label className="ui-inline-check">
                  <input
                    type="checkbox"
                    checked={row.isNightShift}
                    onChange={e => updateRow(idx, { isNightShift: e.target.checked })}
                  />
                  <span>{t('shiftDefs.night')}</span>
                </label>
                {rows.length > 1 && (
                  <IconButton onClick={() => removeRow(idx)} className="ui-btn ui-btn-ghost ml-1 text-base leading-none text-ink-3"
                    label={t('shiftDefs.form.removeRow')}
                    icon={'×'}
                  />
                )}
              </div>
            </div>
            <RowLength row={row} id={lengthId} />
          </div>
          )
        })}
      </div>

      {rows.length < 4 && (
        <button type="button" onClick={addRow} className="ui-text-action text-sm">
          {t('shiftDefs.form.addShift')}
        </button>
      )}

      {errors.form && <p role="alert" className="ui-error-text">{errors.form}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <LoadingButton
          type="button"
          isLoading={createMutation.isPending}
          loadingLabel={t('common:actions.saving')}
          onClick={handleSubmit}
          className="ui-btn-primary"
        >
          {t('shiftDefs.form.save')}
        </LoadingButton>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
      </div>
    </section>
  )
}
