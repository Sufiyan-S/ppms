import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../api/inventoryApi'
import { userApi } from '../../api/userApi'
import type { OpenShiftNozzle, TankStock } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Modal } from '../../components/Modal'
import { parseApiError } from '../../utils/apiError'
import { NumericInput } from '../../components/NumericInput'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { LiveFigures } from '../../components/LiveFigures'
import type { LiveFigure } from '../../components/LiveFigures'
import { LitresText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { StillNeeded } from '../../components/StillNeeded'
import { useToastStore } from '../../store/toastStore'
import { formatNumberIn } from '../../i18n/format'
import { codeLabel } from '../../constants/labels'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'

const ROLLOVER_START_FRACTION = 0.99

/** Litres dispensed since the shift opened, following the server's meter rollover rule; null while unknown or invalid. */
function soldSinceOpening(nozzle: OpenShiftNozzle, reading: string): number | null {
  if (reading === '') return null
  const current = Number(reading)
  if (current >= nozzle.openingReading) return current - nozzle.openingReading
  if (nozzle.openingReading >= nozzle.maxMeterValue * ROLLOVER_START_FRACTION) {
    return nozzle.maxMeterValue - nozzle.openingReading + current
  }
  return null
}

function VarianceResult({ variance, tolerance }: { variance: number | null; tolerance: number }) {
  const { t } = useTranslation(['inventory', 'common'])
  if (variance === null) return <LitresText value={null} />
  const badge = Math.abs(variance) < tolerance
    ? <StatusBadge tone="ok" icon={Check} label={t('dipCheck.withinTolerance')} />
    : variance > 0
      ? <StatusBadge tone="warn" icon={AlertTriangle} label={t('dipCheck.surplus')} />
      : <StatusBadge tone="bad" icon={AlertTriangle} label={t('dipCheck.shortage')} />
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <LitresText value={variance} showSign />
      {badge}
    </span>
  )
}

export function DipCheckModal({
  pumpId,
  tank,
  tanks = [],
  onTankChange,
  onClose,
}: {
  pumpId: number
  tank: TankStock
  /** With onTankChange, shows a tank picker when the pump has more than one tank. */
  tanks?: TankStock[]
  onTankChange?: (tankId: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()

  const [measured,        setMeasured]        = useState('')
  const [meterReadings,   setMeterReadings]   = useState<Record<number, string>>({})
  const [checkedByUserId, setCheckedByUserId] = useState<string>('')
  const [notes,           setNotes]           = useState('')
  const [error,           setError]           = useState<string | null>(null)

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn:  () => userApi.getStaff(pumpId),
  })

  const { data: openShiftNozzles = [], isLoading: openShiftNozzlesLoading } = useQuery({
    queryKey: ['openShiftNozzles', pumpId, tank.tankId],
    queryFn:  () => inventoryApi.getOpenShiftNozzles(pumpId, tank.tankId),
  })

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordDipCheck(pumpId, {
        tankId:           tank.tankId,
        measuredQuantity: Number(measured),
        checkedByUserId:  checkedByUserId ? Number(checkedByUserId) : undefined,
        notes:            notes.trim() || undefined,
        nozzleReadings:   openShiftNozzles.map(n => ({ nozzleId: n.nozzleId, meterReading: Number(meterReadings[n.nozzleId]) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['dipChecks', pumpId] })
      addToast(t('dipCheck.saved', { tank: tank.tankIdentifier }), 'success')
      onClose()
    },
    onError: (err) => {
      setError(parseApiError(err, t('dipCheck.failed')))
      queryClient.invalidateQueries({ queryKey: ['openShiftNozzles', pumpId, tank.tankId] })
    },
  })

  const soldPerNozzle = openShiftNozzles.map(n => soldSinceOpening(n, meterReadings[n.nozzleId] ?? ''))
  const soldKnown = soldPerNozzle.every(sold => sold !== null)
  const soldOnOpenShifts = soldPerNozzle.reduce<number>((sum, sold) => sum + (sold ?? 0), 0)
  const expectedStock = tank.currentStock - soldOnOpenShifts
  const variance = measured !== '' && soldKnown ? Number(measured) - expectedStock : null

  const missingReadingCount = openShiftNozzles.filter(n => (meterReadings[n.nozzleId] ?? '') === '').length
  const stillNeeded = [
    ...(measured === '' ? [t('dipCheck.stillNeeded.dipReading')] : []),
    ...(missingReadingCount > 0 ? [t('dipCheck.stillNeeded.meterReadings', { count: missingReadingCount })] : []),
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!measured) { setError(t('dipCheck.measuredRequired')); return }
    if (missingReadingCount > 0) { setError(t('dipCheck.meterReadingsRequired')); return }
    mutation.mutate()
  }

  const figures: LiveFigure[] = [
    { label: t('dipCheck.figures.bookStock'), value: <LitresText value={tank.currentStock} /> },
    ...(openShiftNozzles.length > 0 ? [
      { label: t('dipCheck.figures.soldOnOpenShifts'), value: <LitresText value={soldKnown ? soldOnOpenShifts : null} /> },
      { label: t('dipCheck.figures.expectedStock'), value: <LitresText value={soldKnown ? expectedStock : null} /> },
    ] : []),
    { label: t('dipCheck.figures.measured'), value: <LitresText value={measured === '' ? null : Number(measured)} /> },
    { label: t('dipCheck.figures.variance'), value: <VarianceResult variance={variance} tolerance={tank.dipTolerance} />, isResult: true },
  ]

  return (
    <Modal
      title={t('dipCheck.title')}
      subtitle={`${tank.tankIdentifier} · ${codeLabel(tank.fuelType)}`}
      tone="info"
      size="md-wide"
      onClose={onClose}
      closeOnBackdropClick
      fullScreenOnPhone={openShiftNozzles.length > 0}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={<>
        <StillNeeded id={stillNeededId} items={openShiftNozzlesLoading ? [] : stillNeeded} />
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton
          type="submit"
          isLoading={mutation.isPending}
          loadingLabel={t('dipCheck.saving')}
          disabled={openShiftNozzlesLoading || stillNeeded.length > 0}
          aria-describedby={!openShiftNozzlesLoading && stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn-primary"
        >
          {t('dipCheck.save')}
        </LoadingButton>
      </>}
    >
      <FormGrid>
        {onTankChange && tanks.length > 1 && (
          <FormGridFullRow>
            <span className="ui-label">{t('dipCheck.tank')}</span>
            <SearchableSelect label={t('dipCheck.tank')}
              value={String(tank.tankId)}
              onChange={v => onTankChange(Number(v))}
              options={tanks.map(option => ({ value: String(option.tankId), label: `${option.tankIdentifier} · ${codeLabel(option.fuelType)}` }))}
            />
          </FormGridFullRow>
        )}

        <FormField label={t('dipCheck.dipstickReading')} help={t('dipCheck.noBackdate')}>
          <NumericInput
            required
            step="0.001"
            min="0"
            unit="L"
            value={measured}
            onChange={e => setMeasured(e.target.value)}
            data-autofocus
          />
        </FormField>

        <div>
          <span className="ui-label">
            {t('dipCheck.checkedBy')} <span className="text-ink-3">{t('common:fields.optionalSuffix')}</span>
          </span>
          <SearchableSelect label={t('dipCheck.checkedBy')}
            value={checkedByUserId}
            onChange={v => setCheckedByUserId(v)}
            placeholder={t('dipCheck.selectOperator')}
            options={staff.map(s => ({
              value: String(s.id),
              label: t('dipCheck.staffOption', { name: s.fullName, role: codeLabel(s.role) }),
            }))}
          />
        </div>

        {openShiftNozzlesLoading ? (
          <FormGridFullRow><p className="text-xs text-ink-3">{t('dipCheck.checkingShifts')}</p></FormGridFullRow>
        ) : openShiftNozzles.length > 0 && (
          <fieldset className="ui-form-grid__full">
            <legend className="text-sm font-semibold text-ink">{t('dipCheck.meterReadings')}</legend>
            <p className="mt-1 mb-3 text-xs text-ink-3">{t('dipCheck.openShiftNote')}</p>
            <FormGrid>
              {openShiftNozzles.map(n => (
                <FormField
                  key={n.nozzleId}
                  label={n.duName
                    ? t('dipCheck.nozzleReadingWithDu', { number: n.nozzleNumber, du: n.duName })
                    : t('dipCheck.nozzleReading', { number: n.nozzleNumber })}
                  help={t('dipCheck.openedAt', { reading: formatNumberIn(n.openingReading, { maximumFractionDigits: 3 }) })}
                >
                  <NumericInput
                    required
                    step="0.001"
                    min="0"
                    unit="L"
                    value={meterReadings[n.nozzleId] ?? ''}
                    onChange={e => setMeterReadings(prev => ({ ...prev, [n.nozzleId]: e.target.value }))}
                  />
                </FormField>
              ))}
            </FormGrid>
          </fieldset>
        )}

        <FormGridFullRow>
          <LiveFigures label={t('dipCheck.figures.label')} figures={figures} />
        </FormGridFullRow>

        <FormGridFullRow>
          <FormField label={<>{t('common:fields.notes')} <span className="text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} />
          </FormField>
        </FormGridFullRow>

        {error && <FormGridFullRow><p role="alert" className="ui-alert ui-alert-danger">{error}</p></FormGridFullRow>}
      </FormGrid>
    </Modal>
  )
}
