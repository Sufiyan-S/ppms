import { useId, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { parseApiError, translatedServerError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, PriceDeviationWarning, FuelPrice } from '../../api/pumpApi'
import type { FuelType } from '../../types/shift'
import { isPriceStale } from '../../utils/fuelPrices'
import { useToastStore } from '../../store/toastStore'
import { IconButton } from '../../components/IconButton'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { FuelPriceCard } from './prices/FuelPriceCard'
import { PriceDeviationDialog } from './prices/PriceDeviationDialog'
import type { DeviationWarning } from './prices/PriceDeviationDialog'
import { StalePricesAlert } from './prices/StalePricesAlert'

export function FuelPricesContent({ pump, currentPrices }: { pump: PumpSummary; currentPrices: FuelPrice[] }) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  // Dynamic price inputs keyed by fuel type (only for fuel types actually present on this pump)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [error, setError]   = useState<string | null>(null)
  // Set to true immediately after a successful save so the alert disappears without waiting for query refetch
  const [pricesConfirmedToday, setPricesConfirmedToday] = useState(false)
  // 15% deviation warning state — set when backend returns HTTP 409
  const [deviationWarning, setDeviationWarning] = useState<DeviationWarning | null>(null)
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
    e.preventDefault(); setError(null); setDeviationWarning(null); setOpenShiftsWarning(null)
    const tasks = pricesToSave
      .map((ft) => mutation.mutateAsync({ pumpId: pump.id, fuelType: ft, pricePerUnit: Number(prices[ft]) }))
    if (tasks.length === 0) { setError(t('prices.enterOne')); return }
    try {
      const results = await Promise.all(tasks)
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPrices({})
      setPricesConfirmedToday(true)
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
    setError(null); setOpenShiftsWarning(null); setConfirmingUnchanged(true)
    const tasks = currentPrices.map((p) =>
      mutation.mutateAsync({ pumpId: pump.id, fuelType: p.fuelType as FuelType, pricePerUnit: Number(p.pricePerUnit) })
    )
    try {
      const results = await Promise.all(tasks)
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPricesConfirmedToday(true)
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
      addToast(t('prices.updated'), 'success')
      if (result.openShiftsWarning) setOpenShiftsWarning(result.openShiftsWarning)
    } catch (err) {
      setError(parseApiError(err, t('prices.setFailed')))
    }
  }

  const pricesStale = !pricesConfirmedToday && currentPrices.length > 0 && isPriceStale(currentPrices)

  if (pump.dus.length === 0) {
    return <p className="text-xs text-ink-3">{t('prices.needDu')}</p>
  }

  return (
    <div className="space-y-4">
      {pricesStale && (
        <StalePricesAlert currentPrices={currentPrices} isConfirming={confirmingUnchanged}
          disabled={mutation.isPending} onConfirmSamePrices={confirmUnchanged} />
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {availableFuelTypes.map((ft) => (
            <FuelPriceCard key={ft} fuelType={ft} currentPrice={getCurrentPrice(ft)} value={prices[ft] ?? ''}
              onChange={(value) => setPrices((prev) => ({ ...prev, [ft]: value }))} />
          ))}
        </div>
        {error   && <p role="alert" className="ui-error-text">{error}</p>}
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

      {deviationWarning && (
        <PriceDeviationDialog warning={deviationWarning} onEdit={() => setDeviationWarning(null)} onConfirm={confirmDeviation} />
      )}
    </div>
  )
}
