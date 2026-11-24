import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { parseApiError } from '../../../utils/apiError'
import { localDateInputValue } from '../../../utils/date'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'

interface Props {
  pumpId: number
  effectiveFrom: string
  onClose: () => void
  onError: (message: string) => void
}

/** Asks for the schedule's last active date, today by default, before disabling it. */
export function DisableSchedulePanel({ pumpId, effectiveFrom, onClose, onError }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const qc = useQueryClient()
  const todayStr = localDateInputValue()
  const [fromToday, setFromToday] = useState(true)
  const [pickedDate, setPickedDate] = useState(effectiveFrom)
  const [dateError, setDateError] = useState<string | null>(null)

  const disableMutation = useMutation({
    mutationFn: (disableDate: string) => shiftDefinitionApi.disableGroup(pumpId, effectiveFrom, disableDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      onClose()
    },
    onError: (err) => {
      onClose()
      onError(parseApiError(err, t('shiftDefs.disableFailed')))
    },
  })

  const confirm = () => {
    const disableDate = fromToday ? todayStr : pickedDate
    if (!disableDate) { setDateError(t('shiftDefs.selectDisableDate')); return }
    disableMutation.mutate(disableDate)
  }

  return (
    <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{t('shiftDefs.disableTitle')}</p>
        <p className="mt-0.5 text-xs text-ink-3">{t('shiftDefs.disableExplanation')}</p>
      </div>
      <label className="ui-inline-check">
        <input type="checkbox" checked={fromToday} onChange={e => { setFromToday(e.target.checked); setDateError(null) }} />
        <span>{t('shiftDefs.disableFromToday', { date: todayStr })}</span>
      </label>
      {!fromToday && (
        <FormField label={t('shiftDefs.lastActiveDate')} help={t('shiftDefs.activeUntilHint')} error={dateError ?? undefined} className="max-w-xs">
          <input type="date" value={pickedDate} min={todayStr}
            onChange={e => { setPickedDate(e.target.value); setDateError(null) }} className="text-sm" />
        </FormField>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" isLoading={disableMutation.isPending} loadingLabel={t('nozzles.disable.disabling')}
          onClick={confirm} className="ui-btn-danger ui-btn-compact">
          {t('shiftDefs.confirmDisable')}
        </LoadingButton>
      </div>
    </div>
  )
}
