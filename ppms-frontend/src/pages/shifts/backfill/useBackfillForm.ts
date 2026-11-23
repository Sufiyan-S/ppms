import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { userApi } from '../../../api/userApi'
import { fuelPriceApi } from '../../../api/fuelPriceApi'
import type { BackfillShiftRequest, BackfillNozzleReading, CreditEntryInput } from '../../../types/shift'
import type { DUOption, NozzleDetail } from '../../../types/shift'
import { parseApiError } from '../../../utils/apiError'
import { useConfirmDiscard } from '../../../hooks/useConfirmDiscard'
import { useOnValuesChange } from '../../../hooks/useOnValuesChange'
import { roundToMillilitres, roundToPaise, toPaise } from '../../../utils/money'
import { pumpApi } from '../../../api/pumpApi'
import { codeLabel } from '../../../constants/labels'
import { maxDate, safeParse, newCreditRow } from './backfillHelpers'
import type { CreditRow, BackfillShiftModalProps } from './backfillHelpers'

export function useBackfillForm({ pumpId, onClose }: BackfillShiftModalProps) {
  const { t } = useTranslation('shifts')
  const qc = useQueryClient()

  const [shiftDate,         setShiftDate]         = useState(maxDate())
  const [shiftDefinitionId, setShiftDefinitionId] = useState<number | null>(null)
  const [selectedDU,        setSelectedDU]        = useState<DUOption | null>(null)
  const [operatorId,        setOperatorId]        = useState<number | null>(null)
  const [operatorSearch,    setOperatorSearch]    = useState('')
  const [selectedNozzleIds, setSelectedNozzleIds] = useState<Set<number>>(new Set())
  const [openingReadings,   setOpeningReadings]   = useState<Record<number, string>>({})
  const [closingReadings,   setClosingReadings]   = useState<Record<number, string>>({})

  // Manual fuel rate inputs — for fuel types with no DB price, or when overriding a DB price
  const [fuelRateInputs,  setFuelRateInputs]  = useState<Record<string, string>>({})
  // Tracks which fuel types the user is actively overriding (even when a DB price exists)

  const [cashCollected,      setCashCollected]      = useState('')
  const [upiCollected,       setUpiCollected]       = useState('')
  const [cardCollected,      setCardCollected]      = useState('')
  const [fleetCardCollected, setFleetCardCollected] = useState('')
  const [creditRows,       setCreditRows]       = useState<CreditRow[]>([])
  const [expandedCreditId, setExpandedCreditId] = useState<number | null>(null)
  const [discrepancyReason, setDiscrepancyReason] = useState('')
  const [error,             setError]             = useState<string | null>(null)

  // ── Data queries ──────────────────────────────────────────────────────────

  const { data: definitionsData, isLoading: defsLoading } = useQuery({
    queryKey: ['shift-definitions-for-date', pumpId, shiftDate],
    queryFn:  () => shiftDefinitionApi.getForDate(pumpId, shiftDate),
    enabled:  !!shiftDate,
  })

  const definitions = definitionsData ?? []
  useOnValuesChange([definitionsData], () => {
    setShiftDefinitionId(definitionsData?.length === 1 ? definitionsData[0].id : null)
  })

  const { data: dus = [], isLoading: dusLoading } = useQuery({
    queryKey: ['dus', pumpId],
    queryFn:  () => pumpApi.getDUs(pumpId),
  })

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClients(pumpId),
  })
  const creditClientOptions = useMemo(() => {
    const nameById = new Map(creditClients.map(c => [c.id, c.name]))
    return creditClients
      .filter(c => c.isActive)
      .map(c => ({
        value: String(c.id),
        label: c.parentClientId ? `${nameById.get(c.parentClientId) ?? ''} › ${c.name}` : c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [creditClients])

  const { data: operators = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['operators', pumpId],
    queryFn:  () => userApi.getOperators(pumpId),
  })

  // Fetch historical fuel prices for the selected date
  const { data: pricesForDate = [] } = useQuery({
    queryKey: ['fuel-prices-for-date', pumpId, shiftDate, shiftDefinitionId],
    queryFn:  () => fuelPriceApi.getForDate(pumpId, shiftDate, shiftDefinitionId),
    enabled:  !!shiftDate,
  })

  // Build a map: fuelType → pricePerUnit (null if not in DB for this date)
  const dbPriceMap = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const p of pricesForDate) {
      map[p.fuelType] = p.pricePerUnit
    }
    return map
  }, [pricesForDate])

  // Fuel types needed for selected nozzles
  const selectedFuelTypes = useMemo(() => {
    const types = new Set<string>()
    for (const nozzleId of selectedNozzleIds) {
      const nozzle = selectedDU?.nozzles.find(n => n.id === nozzleId)
      if (nozzle) types.add(nozzle.fuelType)
    }
    return types
  }, [selectedNozzleIds, selectedDU])

  const selectDU = (du: DUOption | null) => {
    if (du?.id === selectedDU?.id) return
    setSelectedDU(du)
    setSelectedNozzleIds(new Set())
    setOpeningReadings({})
    setClosingReadings({})
  }

  const filteredOperators = operators.filter((op) =>
    op.status === 'ACTIVE' &&
    (operatorSearch === '' ||
      op.fullName.toLowerCase().includes(operatorSearch.toLowerCase()) ||
      op.employeeId.toLowerCase().includes(operatorSearch.toLowerCase()))
  )

  const availableNozzles: NozzleDetail[] = selectedDU?.nozzles ?? []

  const toggleNozzle = (id: number) => {
    setSelectedNozzleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setOpeningReadings((r) => { const n = { ...r }; delete n[id]; return n })
        setClosingReadings((r) => { const n = { ...r }; delete n[id]; return n })
      } else {
        next.add(id)
      }
      return next
    })
  }

  function litersForNozzle(nozzleId: number): number | null {
    const o = parseFloat(openingReadings[nozzleId] ?? '')
    const c = parseFloat(closingReadings[nozzleId] ?? '')
    if (!isFinite(o) || !isFinite(c)) return null
    const diff = c - o
    return diff >= 0 ? roundToMillilitres(diff) : null
  }

  // Effective rate: DB price if available, else manual input
  function getEffectiveRate(fuelType: string): number | null {
    const dbPrice = dbPriceMap[fuelType]
    if (typeof dbPrice === 'number') return dbPrice
    const input = parseFloat(fuelRateInputs[fuelType] ?? '')
    return isFinite(input) && input > 0 ? input : null
  }

  // Per-nozzle expected amount and totals. Like the backend, the meter total is rounded to paise once.
  const nozzleExpected: Record<number, number | null> = {}
  let unroundedTotal: number | null = 0
  let allRatesResolved = true
  for (const nozzleId of selectedNozzleIds) {
    const nozzle = availableNozzles.find(n => n.id === nozzleId)
    const liters = litersForNozzle(nozzleId)
    const rate = nozzle ? getEffectiveRate(nozzle.fuelType) : null
    if (liters !== null && rate !== null) {
      nozzleExpected[nozzleId] = roundToPaise(liters * rate)
      if (unroundedTotal !== null) unroundedTotal += liters * rate
    } else {
      nozzleExpected[nozzleId] = null
      unroundedTotal = null
    }
    if (nozzle && rate === null) allRatesResolved = false
  }
  const totalExpected = unroundedTotal !== null ? roundToPaise(unroundedTotal) : null

  // Credit sales are part of the metered fuel, so they count as collected — not as extra amount due.
  const creditNum = roundToPaise(creditRows.reduce((sum, row) => sum + safeParse(row.amount), 0))
  const totalCollected = roundToPaise(
    safeParse(cashCollected) + safeParse(upiCollected) + safeParse(cardCollected) + safeParse(fleetCardCollected) + creditNum
  )
  const discrepancyAmt = totalExpected !== null ? (toPaise(totalCollected) - toPaise(totalExpected)) / 100 : null

  function addCreditRow() {
    const row = newCreditRow()
    setCreditRows((prev) => [...prev, row])
    setExpandedCreditId(row._key)
  }
  function removeCreditRow(key: number) {
    setCreditRows((prev) => prev.filter((r) => r._key !== key))
    if (expandedCreditId === key) setExpandedCreditId(null)
  }
  function updateCreditRow(key: number, patch: Partial<CreditRow>) {
    setCreditRows((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (req: BackfillShiftRequest) => shiftApi.backfillShift(pumpId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shiftHistory', pumpId] })
      qc.invalidateQueries({ queryKey: ['activeShifts', pumpId] })
      onClose()
    },
    onError: (err) => setError(parseApiError(err, t('backfill.errors.failed'))),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!shiftDate)           return setError(t('backfill.errors.selectDate'))
    if (!shiftDefinitionId)   return setError(t('backfill.errors.selectWindow'))
    if (!selectedDU)          return setError(t('backfill.errors.selectDu'))
    if (!operatorId)          return setError(t('backfill.errors.selectOperator'))
    if (selectedNozzleIds.size === 0) return setError(t('backfill.errors.selectNozzle'))

    // Validate that all fuel rates are provided
    for (const fuelType of selectedFuelTypes) {
      if (getEffectiveRate(fuelType) === null) {
        return setError(t('backfill.errors.enterRate', { fuel: codeLabel(fuelType), date: shiftDate }))
      }
    }

    const nozzleReadings: BackfillNozzleReading[] = []
    for (const nozzleId of selectedNozzleIds) {
      const opening = parseFloat(openingReadings[nozzleId] ?? '')
      const closing = parseFloat(closingReadings[nozzleId] ?? '')
      const nozzle  = availableNozzles.find((n) => n.id === nozzleId)
      if (!isFinite(opening) || opening < 0)
        return setError(t('backfill.errors.openingRequired', { number: nozzle?.nozzleNumber ?? nozzleId }))
      if (!isFinite(closing) || closing < 0)
        return setError(t('backfill.errors.closingRequired', { number: nozzle?.nozzleNumber ?? nozzleId }))
      if (closing < opening)
        return setError(t('backfill.errors.closingBelowOpening', { number: nozzle?.nozzleNumber ?? nozzleId }))
      nozzleReadings.push({ nozzleId, openingReading: opening, closingReading: closing })
    }

    const creditEntries: CreditEntryInput[] = []
    for (const row of creditRows) {
      if (!row.clientId)
        return setError(t('backfill.errors.selectClient'))
      const amt = parseFloat(row.amount)
      if (!isFinite(amt) || amt <= 0)
        return setError(t('backfill.errors.amountPositive', { name: row.clientName }))
      creditEntries.push({
        clientId:    row.clientId,
        clientName:  row.clientName.trim(),
        amount:      amt,
        fuelType:    row.fuelType || undefined,
        billNo:      row.billNo.trim() || undefined,
        description: row.description.trim() || undefined,
      })
    }

    // A recorded price cannot be overridden here, so rates are sent only for fuel types without one
    const fuelRateOverrides: Record<string, number> = {}
    for (const fuelType of selectedFuelTypes) {
      const dbPrice = dbPriceMap[fuelType]
      if (dbPrice === null || dbPrice === undefined) {
        const rate = parseFloat(fuelRateInputs[fuelType] ?? '')
        if (isFinite(rate) && rate > 0) {
          fuelRateOverrides[fuelType] = rate
        }
      }
    }

    mutation.mutate({
      shiftDefinitionId,
      shiftDate,
      duId:              selectedDU.id,
      operatorId,
      nozzleReadings,
      cashCollected:      safeParse(cashCollected),
      upiCollected:       safeParse(upiCollected),
      cardCollected:      safeParse(cardCollected),
      fleetCardCollected: safeParse(fleetCardCollected),
      creditTotal:        creditNum,
      creditEntries,
      discrepancyReason: discrepancyReason.trim() || undefined,
      fuelRateOverrides: Object.keys(fuelRateOverrides).length > 0 ? fuelRateOverrides : undefined,
    })
  }

  const isPending = mutation.isPending
  const hasUnsavedChanges = !!operatorId || selectedNozzleIds.size > 0 || creditRows.length > 0
    || cashCollected !== '' || upiCollected !== '' || cardCollected !== '' || fleetCardCollected !== ''
    || discrepancyReason.trim() !== ''
  const { requestClose, isConfirming, discard, keepEditing } = useConfirmDiscard(hasUnsavedChanges, onClose)
  const canSubmit = !!shiftDate && !!shiftDefinitionId && !!selectedDU && !!operatorId && selectedNozzleIds.size > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return {
    shiftDate,
    setShiftDate,
    shiftDefinitionId,
    setShiftDefinitionId,
    selectedDU,
    operatorId,
    setOperatorId,
    operatorSearch,
    setOperatorSearch,
    selectedNozzleIds,
    openingReadings,
    setOpeningReadings,
    closingReadings,
    setClosingReadings,
    fuelRateInputs,
    setFuelRateInputs,
    cashCollected,
    setCashCollected,
    upiCollected,
    setUpiCollected,
    cardCollected,
    setCardCollected,
    fleetCardCollected,
    setFleetCardCollected,
    creditRows,
    expandedCreditId,
    setExpandedCreditId,
    discrepancyReason,
    setDiscrepancyReason,
    error,
    defsLoading,
    definitions,
    dus,
    dusLoading,
    creditClients,
    creditClientOptions,
    operatorsLoading,
    dbPriceMap,
    selectedFuelTypes,
    selectDU,
    filteredOperators,
    availableNozzles,
    toggleNozzle,
    litersForNozzle,
    getEffectiveRate,
    nozzleExpected,
    allRatesResolved,
    totalExpected,
    creditNum,
    totalCollected,
    discrepancyAmt,
    addCreditRow,
    removeCreditRow,
    updateCreditRow,
    handleSubmit,
    isPending,
    requestClose,
    isConfirming,
    discard,
    keepEditing,
    canSubmit,
  }
}

export type BackfillForm = ReturnType<typeof useBackfillForm>
