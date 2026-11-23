import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { localDateInputValue } from '../../../utils/date'
import { dipApi } from '../../../api/dipApi'
import type { TankInfo } from '../../../api/pumpApi'
import type { NozzleDetail } from '../../../types/shift'
import { useToastStore } from '../../../store/toastStore'
import { codeLabel } from '../../../constants/labels'
import { FUEL_UNIT } from '../../../constants/fuel'
import { formatNumberIn } from '../../../i18n/format'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  nozzle: NozzleDetail
  /** The tank the nozzle draws from — drained fuel leaves this tank's stock. */
  tank: TankInfo | null
  onClose: () => void
}

export function RecordDipPanel({ pumpId, nozzle, tank, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateNozzles(pumpId)
  const titleId = useId()
  const [dipLitres, setDipLitres] = useState('')
  const dipDate = localDateInputValue()
  const [dipReason, setDipReason] = useState('')
  const [dipError, setDipError] = useState<string | null>(null)

  const recordDipMutation = useMutation({
    mutationFn: ({ tankId, litresRemoved, reason, date }: { tankId: number; litresRemoved: number; reason: string; date: string }) =>
      dipApi.recordDip(pumpId, tankId, litresRemoved, reason, date),
    onSuccess: () => {
      onClose()
      addToast(t('nozzles.dip.recorded'), 'success')
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['tanks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
    },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.dip.failed')); setDipError(msg); addToast(msg, 'error') },
  })

  const unit = FUEL_UNIT[nozzle.fuelType] ?? 'L'
  const formatQuantity = (value: number) => `${formatNumberIn(value, { maximumFractionDigits: 3 })} ${unit}`
  const litres = Number(dipLitres)
  const hasLitres = dipLitres !== '' && Number.isFinite(litres) && litres > 0
  const tooMuch = tank !== null && hasLitres && litres > tank.currentStock

  const submitDip = (e: React.FormEvent) => {
    e.preventDefault(); setDipError(null)
    if (!tank) { setDipError(t('nozzles.dip.mapFirst')); return }
    if (!dipLitres || Number(dipLitres) <= 0) { setDipError(t('nozzles.dip.invalidLitres')); return }
    if (tooMuch) return
    if (!dipReason.trim()) { setDipError(t('nozzles.reasonRequired')); return }
    recordDipMutation.mutate({
      tankId: tank.id,
      litresRemoved: Number(dipLitres),
      reason: dipReason,
      date: dipDate,
    })
  }

  return (
    <div className="px-4 py-3 border-t border-border">
      <form onSubmit={submitDip} aria-labelledby={titleId} className="ui-dip-editor">
        <div className="ui-dip-editor__hero">
          <div>
            <h3 id={titleId} className="ui-title-sm">{t('nozzles.dip.title')}</h3>
            <p id={`${titleId}-context`} className="ui-subtitle mt-1">
              {t('nozzles.dip.context', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType) })}
              {' · '}
              {tank ? t('nozzles.dip.fromTank', { name: tank.tankIdentifier }) : t('nozzles.dip.notMapped')}
            </p>
          </div>
        </div>
        <p className="text-xs text-ink-3">{t('nozzles.dip.subtitle')}</p>
        <div className="ui-dip-editor__grid">
          <FormField
            className="ui-dip-editor__section"
            label={t('nozzles.dip.litresRemoved')}
            error={tooMuch && tank ? t('nozzles.dip.tooMuch', { name: tank.tankIdentifier, stock: tank.currentStock }) : undefined}
          >
            <NumericInput
              step="0.001"
              min="0.001"
              unit={unit}
              value={dipLitres}
              disabled={!tank}
              onChange={(e) => setDipLitres(e.target.value)}
            />
          </FormField>
          <FormField className="ui-dip-editor__section" label={t('common:fields.reason')}>
            <input
              type="text"
              value={dipReason}
              onChange={(e) => setDipReason(e.target.value)}
              placeholder={t('nozzles.dip.reasonPlaceholder')}
              className="text-sm"
            />
          </FormField>
        </div>
        {tank && (
          <LiveFigures
            label={t('nozzles.dip.stockAfter')}
            figures={[
              { label: t('nozzles.dip.inTankNow'), value: formatQuantity(tank.currentStock) },
              { label: t('nozzles.dip.removing'), value: hasLitres ? formatQuantity(litres) : '—' },
              {
                label: t('nozzles.dip.leftInTank'),
                value: hasLitres && !tooMuch ? formatQuantity(tank.currentStock - litres) : '—',
                isResult: true,
              },
            ]}
          />
        )}
        <FormField className="ui-dip-editor__section" label={t('nozzles.dip.date')} help={t('nozzles.dip.todayOnly')}>
          <input
            type="date"
            value={dipDate}
            readOnly
            className="text-sm bg-bg"
          />
        </FormField>
        {dipError && <p role="alert" className="ui-error-text">{dipError}</p>}
        <div className="ui-dip-editor__actions">
          <LoadingButton
            type="submit"
            isLoading={recordDipMutation.isPending}
            loadingLabel={t('nozzles.dip.recording')}
            disabled={!tank}
            aria-describedby={tank ? undefined : `${titleId}-context`}
            className="ui-btn-primary"
          >
            {t('nozzles.row.recordDip')}
          </LoadingButton>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
