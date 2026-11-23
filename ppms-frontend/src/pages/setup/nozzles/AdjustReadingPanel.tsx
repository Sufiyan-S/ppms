import { useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { dipApi } from '../../../api/dipApi'
import type { NozzleDetail } from '../../../types/shift'
import { useToastStore } from '../../../store/toastStore'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatNumberIn } from '../../../i18n/format'
import { formatWithSign } from '../../../utils/format'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  nozzle: NozzleDetail
  onClose: () => void
}

export function AdjustReadingPanel({ pumpId, nozzle, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const titleId = useId()
  const [adjustType, setAdjustType] = useState<'RESET' | 'CUSTOM_READING'>('CUSTOM_READING')
  const [adjustReading, setAdjustReading] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const recordAdjustmentMutation = useMutation({
    mutationFn: ({ nozzleId, adjustmentType, reason, newReading }: { nozzleId: number; adjustmentType: 'RESET' | 'CUSTOM_READING'; reason: string; newReading?: number }) =>
      dipApi.recordAdjustment(pumpId, nozzleId, adjustmentType, reason, newReading),
    onSuccess: () => { onClose(); addToast(t('nozzles.reading.adjusted'), 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.reading.failed')); setAdjustError(msg); addToast(msg, 'error') },
  })

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault(); setAdjustError(null)
    if (!adjustReason.trim()) { setAdjustError(t('nozzles.reasonRequired')); return }
    if (adjustType === 'CUSTOM_READING') {
      if (!adjustReading) { setAdjustError(t('nozzles.reading.enterReading')); return }
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'CUSTOM_READING',
        reason: adjustReason,
        newReading: Number(adjustReading),
      })
    } else {
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'RESET',
        reason: adjustReason,
      })
    }
  }

  const unit = FUEL_UNIT[nozzle.fuelType] ?? 'L'
  const formatReading = (value: number) => `${formatNumberIn(value, { maximumFractionDigits: 3 })} ${unit}`
  const typed = Number(adjustReading)
  const newReading = adjustType === 'RESET'
    ? 0
    : adjustReading !== '' && Number.isFinite(typed) && typed >= 0 ? typed : null
  const difference = newReading === null ? null : Math.round((newReading - nozzle.lastReading) * 1000) / 1000

  return (
    <div className="px-4 py-3 border-t border-border">
      <form onSubmit={submitAdjustment} aria-labelledby={titleId} className="ui-reading-editor">
        <div className="ui-reading-editor__hero">
          <div>
            <h3 id={titleId} className="ui-title-sm">{t('nozzles.reading.title')}</h3>
            <p className="ui-subtitle mt-1">
              {t('nozzles.reading.context', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType) })}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-3">
          {t('nozzles.reading.subtitle')} {t('nozzles.reading.activeShiftWarning')}
        </p>
        <fieldset className="ui-reading-editor__section">
          <legend className="ui-label mb-1">{t('nozzles.reading.type')}</legend>
          <div className="ui-reading-editor__mode-grid">
            <button
              type="button"
              aria-pressed={adjustType === 'CUSTOM_READING'}
              onClick={() => setAdjustType('CUSTOM_READING')}
              className={`ui-reading-editor__mode-card ${adjustType === 'CUSTOM_READING' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--custom' : ''}`}
            >
              <span className="ui-reading-editor__mode-title">{t('nozzles.reading.custom')}</span>
              <span className="ui-reading-editor__mode-copy">{t('nozzles.reading.customHint')}</span>
            </button>
            <button
              type="button"
              aria-pressed={adjustType === 'RESET'}
              onClick={() => setAdjustType('RESET')}
              className={`ui-reading-editor__mode-card ${adjustType === 'RESET' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--danger' : ''}`}
            >
              <span className="ui-reading-editor__mode-title">{t('nozzles.reading.reset')}</span>
              <span className="ui-reading-editor__mode-copy">{t('nozzles.reading.resetHint')}</span>
            </button>
          </div>
        </fieldset>
        {adjustType === 'CUSTOM_READING' && (
          <FormField className="ui-reading-editor__section max-w-xs" label={t('nozzles.reading.newReading')}>
            <NumericInput
              step="0.001"
              min="0"
              unit={unit}
              value={adjustReading}
              onChange={(e) => setAdjustReading(e.target.value)}
            />
          </FormField>
        )}
        {adjustType === 'RESET' && (
          <p role="note" className="ui-alert ui-alert-danger text-xs">
            {t('nozzles.reading.resetWarningBefore', { number: nozzle.nozzleNumber })} <strong>0.00</strong>{t('nozzles.reading.resetWarningAfter')}
          </p>
        )}
        <LiveFigures
          label={t('nozzles.reading.changeSummary')}
          figures={[
            { label: t('nozzles.reading.currentReading'), value: formatReading(nozzle.lastReading) },
            { label: t('nozzles.reading.newReading'), value: newReading === null ? '—' : formatReading(newReading) },
            {
              label: t('nozzles.reading.difference'),
              value: difference === null ? '—' : formatWithSign(difference, formatReading),
              isResult: true,
            },
          ]}
        />
        <FormField className="ui-reading-editor__section" label={t('common:fields.reason')} help={t('nozzles.reading.reasonHint')}>
          <input
            type="text"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder={t('nozzles.reading.reasonPlaceholder')}
            className="text-sm"
          />
        </FormField>
        {adjustError && <p role="alert" className="ui-error-text">{adjustError}</p>}
        <div className="ui-reading-editor__actions">
          <LoadingButton
            type="submit"
            isLoading={recordAdjustmentMutation.isPending}
            loadingLabel={t('common:actions.saving')}
            className={adjustType === 'RESET' ? 'ui-btn-danger' : 'ui-btn-primary'}
          >
            {adjustType === 'RESET' ? t('nozzles.reading.resetSubmit') : t('nozzles.reading.saveSubmit')}
          </LoadingButton>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
