import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { parseApiError } from '../../../utils/apiError'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { CreateShiftDefinitionRequest } from '../../../api/shiftDefinitionApi'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { subtractOneMinute, TIME_OPTS, defaultRows } from './shiftDefinitionRows'
import { ShiftRowCard } from './ShiftRowCard'
import type { ShiftRow } from './shiftDefinitionRows'

/** Which date field a validation message belongs under; anything else is shown above the buttons. */
interface FormErrors {
  startDate?: string
  endDate?: string
  form?: string
}

export function CreateShiftBatchForm({ pumpId, onClose }: { pumpId: number; onClose: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const qc = useQueryClient()
  const titleId = useId()
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
    <section aria-labelledby={titleId} className="ui-card-plain ui-card-muted space-y-4 p-4 md:p-5">
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

      <ul aria-label={t('shiftDefs.form.shiftsLabel')} className="space-y-2">
        {rows.map((row, idx) => {
          // Only named rows hold on to their times; an unnamed row still has the placeholder times.
          const configuredOtherRows = rows.filter((r, i) => i !== idx && r.name.trim() !== '')
          const usedStarts = new Set(configuredOtherRows.map(r => r.startTime))
          const usedEnds   = new Set(configuredOtherRows.map(r => r.endTime))
          return (
            <ShiftRowCard
              key={idx}
              row={row}
              startOptions={TIME_OPTS.filter(o => !usedStarts.has(o.value))}
              endOptions={TIME_OPTS.filter(o => !usedEnds.has(o.value))}
              onChange={patch => updateRow(idx, patch)}
              onRemove={rows.length > 1 ? () => removeRow(idx) : undefined}
            />
          )
        })}
      </ul>

      {rows.length < 4 && (
        <button type="button" onClick={addRow} className="ui-btn ui-btn-secondary ui-btn-compact gap-1.5 border-dashed">
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
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
