import { useId, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check } from 'lucide-react'
import { parseApiError, translatedServerError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, PriceDeviationWarning, FuelPrice } from '../../api/pumpApi'
import type { FuelType } from '../../types/shift'
import { formatIstDate } from '../../utils/date'
import { isPriceStale } from '../../utils/fuelPrices'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { MoneyText } from '../../components/AmountText'
import { IconButton } from '../../components/IconButton'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LiveFigures } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { NumericInput } from '../../components/NumericInput'
import { StillNeeded } from '../../components/StillNeeded'
import { FUEL_UNIT } from '../../constants/fuel'
import { codeLabel } from '../../constants/labels'
import { formatDecimal, formatWithSign } from '../../utils/format'
import { priceChange } from './fuelPriceChange'

const formatPercent = (percent: number) => formatWithSign(percent, (n) => `${formatDecimal(n, 1)}%`)

function FuelPriceField({ fuelType, currentPrice, value, onChange }: {
  fuelType: FuelType; currentPrice: number | undefined; value: string; onChange: (value: string) => void
}) {
  const { t } = useTranslation(['setup', 'common'])
  const unit = FUEL_UNIT[fuelType] ?? 'L'
  const change = priceChange(currentPrice, value)
  const help = currentPrice == null ? t('prices.noCurrentPrice') : (
    <span className="tabular-nums">
      {t('prices.currentPrice')} <MoneyText value={currentPrice} />/{unit}
      {change && (
        <>
          {' · '}{t('prices.change')}{' '}
          <MoneyText value={change.amount} showSign className="font-semibold text-ink" />
          {change.percent !== null && ` (${formatPercent(change.percent)})`}
        </>
      )}
    </span>
  )
  return (
    <FormField label={codeLabel(fuelType)} help={help}>
      <NumericInput step="0.01" min="0.01" unit={`₹/${unit}`} value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  )
}

// ── Fuel prices content ───────────────────────────────────────────────────────

export function FuelPricesContent({ pump, currentPrices }: { pump: PumpSummary; currentPrices: FuelPrice[] }) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  // Dynamic price inputs keyed by fuel type (only for fuel types actually present on this pump)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // Set to true immediately after a successful save so the alert disappears without waiting for query refetch
  const [pricesConfirmedToday, setPricesConfirmedToday] = useState(false)
  // 15% deviation warning state — set when backend returns HTTP 409
  const [deviationWarning, setDeviationWarning] = useState<(PriceDeviationWarning & { fuelType: string }) | null>(null)
  // P2.3 — open shifts warning shown after a successful price update
  const [openShiftsWarning, setOpenShiftsWarning] = useState<string | null>(null)

  // Derive the unique fuel types across all DU nozzles
  const availableFuelTypes = [...new Set(
    pump.dus.flatMap((d) => d.nozzles.map((n) => n.fuelType))
  )] as FuelType[]

  const mutation = useMutation({
    mutationFn: pumpApi.setFuelPrice,
    onError: (err) => {
      const warning = isAxiosError<Partial<PriceDeviationWarning>>(err) && err.response?.status === 409 ? err.response.data : undefined
      if (warning?.deviationPercent != null) {
        // Backend returned a PriceDeviationWarning (has deviationPercent) — show confirmation dialog
        // Determine which fuel type triggered the warning
        const ft = availableFuelTypes.find((f) => prices[f] && Number(prices[f]) > 0) ?? ''
        setDeviationWarning({ ...(warning as PriceDeviationWarning), message: translatedServerError(err) ?? warning.message ?? '', fuelType: ft })
      } else {
        // 409 from a DB constraint violation, or any other error — show the message directly
        setError(parseApiError(err, t('prices.setFailed')))
      }
    },
  })

  const getCurrentPrice = (fuelType: string) =>
    currentPrices.find((p) => p.fuelType === fuelType)?.pricePerUnit

  const pricesToSave = availableFuelTypes.filter((ft) => prices[ft] && Number(prices[ft]) > 0)
  const stillNeeded = pricesToSave.length === 0 ? [t('prices.stillNeededPrice')] : []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSuccess(false); setDeviationWarning(null); setOpenShiftsWarning(null)
    const tasks = pricesToSave
      .map((ft) => mutation.mutateAsync({ pumpId: pump.id, fuelType: ft, pricePerUnit: Number(prices[ft]) }))
    if (tasks.length === 0) { setError(t('prices.enterOne')); return }
    try {
      const results = await Promise.all(tasks)
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPrices({})
      setPricesConfirmedToday(true)
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      addToast(t('prices.updated'), 'success')
      // Show open-shifts warning if any price update detected open shifts
      const warning = results.find((r) => r.openShiftsWarning)?.openShiftsWarning ?? null
      setOpenShiftsWarning(warning)
    } catch { /* error already set by onError */ }
  }

  // Confirms prices are unchanged from yesterday — re-saves current prices for today
  // so the stale alert is dismissed without requiring manual re-entry.
  const [confirmingUnchanged, setConfirmingUnchanged] = useState(false)
  const confirmUnchanged = async () => {
    setError(null); setSuccess(false); setOpenShiftsWarning(null); setConfirmingUnchanged(true)
    const tasks = currentPrices.map((p) =>
      mutation.mutateAsync({ pumpId: pump.id, fuelType: p.fuelType as FuelType, pricePerUnit: Number(p.pricePerUnit) })
    )
    try {
      const results = await Promise.all(tasks)
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPricesConfirmedToday(true)
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      addToast(t('prices.confirmedToday'), 'success')
      const warning = results.find((r) => r.openShiftsWarning)?.openShiftsWarning ?? null
      setOpenShiftsWarning(warning)
    } catch { /* error already set by onError */ }
    finally { setConfirmingUnchanged(false) }
  }

  const confirmDeviation = async () => {
    if (!deviationWarning) return
    setDeviationWarning(null); setError(null)
    try {
      const result = await mutation.mutateAsync({
        pumpId: pump.id,
        fuelType: deviationWarning.fuelType as FuelType,
        pricePerUnit: deviationWarning.newPrice,
        confirmed: true,
      })
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPrices({})
      setPricesConfirmedToday(true)
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      if (result.openShiftsWarning) setOpenShiftsWarning(result.openShiftsWarning)
    } catch (err) {
      setError(parseApiError(err, t('prices.setFailed')))
    }
  }

  const pricesStale = !pricesConfirmedToday && currentPrices.length > 0 && isPriceStale(currentPrices)

  if (pump.dus.length === 0) {
    return <p className="text-xs text-ink-3">{t('prices.needDu')}</p>
  }

  const deviationChange = deviationWarning ? deviationWarning.newPrice - deviationWarning.lastPrice : 0
  const deviationUnit = deviationWarning ? FUEL_UNIT[deviationWarning.fuelType] ?? 'L' : 'L'

  return (
    <div className="space-y-4">
      {/* Stale price alert — shown when no price has been set today */}
      {pricesStale && (() => {
        const lastUpdatedOn = currentPrices.reduce((latest, p) =>
          p.effectiveFrom > latest ? p.effectiveFrom : latest, currentPrices[0].effectiveFrom)
        return (
          <div role="status" className="ui-alert ui-alert-warning flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{t('prices.staleTitle')}</p>
                <p className="text-xs mt-0.5">
                  {t('prices.lastUpdatedOn')}{' '}
                  <span className="font-medium">{formatIstDate(lastUpdatedOn)}</span>
                  {t('prices.staleHint')}
                </p>
              </div>
            </div>
            <LoadingButton type="button" onClick={confirmUnchanged}
              isLoading={confirmingUnchanged} loadingLabel={t('prices.confirming')}
              disabled={mutation.isPending}
              className="ui-btn-secondary ui-btn-compact shrink-0 gap-1.5">
              <Check size={14} strokeWidth={2.5} aria-hidden="true" />{t('prices.samePrices')}
            </LoadingButton>
          </div>
        )
      })()}

      <form onSubmit={submit} className="space-y-3">
        <FormGrid>
          {availableFuelTypes.map((ft) => (
            <FuelPriceField key={ft} fuelType={ft} currentPrice={getCurrentPrice(ft)} value={prices[ft] ?? ''}
              onChange={(value) => setPrices((prev) => ({ ...prev, [ft]: value }))} />
          ))}
        </FormGrid>
        {error   && <p role="alert" className="ui-error-text">{error}</p>}
        {success && <p role="status" className="text-ok text-xs">{t('prices.savedSuccess')}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <LoadingButton type="submit" isLoading={mutation.isPending && !confirmingUnchanged} loadingLabel={t('common:actions.saving')}
            disabled={stillNeeded.length > 0 || mutation.isPending}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('prices.save')}
          </LoadingButton>
        </div>
      </form>

      {/* P2.3 — Open-shifts warning after price change */}
      {openShiftsWarning && (
        <div role="status" className="ui-alert ui-alert-warning flex items-start gap-2.5">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('prices.openShiftsTitle')}</p>
            <p className="text-xs mt-0.5">{openShiftsWarning}</p>
          </div>
          <IconButton onClick={() => setOpenShiftsWarning(null)} className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
            label={t('prices.dismissWarning')}
            icon={'×'}
          />
        </div>
      )}

      {/* 15% deviation confirmation dialog */}
      {deviationWarning && (
        <Modal
          title={t('prices.deviation.title')}
          subtitle={deviationWarning.fuelType ? codeLabel(deviationWarning.fuelType) : undefined}
          tone="warning"
          size="md"
          onClose={() => setDeviationWarning(null)}
          bodyClassName="space-y-4"
          footer={
            <>
              <button type="button" onClick={() => setDeviationWarning(null)} className="ui-btn ui-btn-secondary">
                {t('prices.deviation.edit')}
              </button>
              <button type="button" onClick={confirmDeviation} data-autofocus className="ui-btn ui-btn-primary">
                {t('prices.deviation.confirm')}
              </button>
            </>
          }
        >
          {deviationWarning.message && <p className="text-sm text-ink-2">{deviationWarning.message}</p>}
          <LiveFigures
            figures={[
              { label: t('prices.deviation.lastPrice'), value: <><MoneyText value={deviationWarning.lastPrice} />/{deviationUnit}</> },
              { label: t('prices.deviation.newPrice'), value: <><MoneyText value={deviationWarning.newPrice} />/{deviationUnit}</> },
              {
                label: t('prices.deviation.deviation'),
                value: (
                  <span className="text-warn">
                    <MoneyText value={deviationChange} showSign />
                    {' '}({formatPercent(deviationChange < 0 ? -Math.abs(deviationWarning.deviationPercent) : Math.abs(deviationWarning.deviationPercent))})
                  </span>
                ),
                isResult: true,
              },
            ]}
          />
          <p className="text-xs text-ink-3">{t('prices.deviation.body')}</p>
        </Modal>
      )}
    </div>
  )
}
