import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Check, Pencil, RotateCcw } from 'lucide-react'
import { shiftApi } from '../../api/shiftApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { userApi } from '../../api/userApi'
import { fuelPriceApi } from '../../api/fuelPriceApi'
import type { BackfillShiftRequest, BackfillNozzleReading, CreditEntryInput } from '../../types/shift'
import type { DUOption, NozzleDetail } from '../../types/shift'
import { ModalPortal } from '../../components/ModalPortal'
import { SearchableSelect } from '../../components/SearchableSelect'
import { parseApiError } from '../../utils/apiError'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function maxDate(): string { return localDateStr(new Date(Date.now() - 86_400_000)) }
function minDate(): string { return localDateStr(new Date(Date.now() - 365 * 86_400_000)) }

function safeParse(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) && n >= 0 ? n : 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const FUEL_LABELS: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
  DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}

// ── Credit entry row state ────────────────────────────────────────────────────

interface CreditRow {
  _key: number
  clientName: string
  amount: string
  fuelType: string
  billNo: string
  description: string
}

let _rowKey = 0
function newCreditRow(): CreditRow {
  return { _key: ++_rowKey, clientName: '', amount: '', fuelType: '', billNo: '', description: '' }
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </p>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  pumpId: number
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BackfillShiftModal({ pumpId, onClose }: Props) {
  useEscapeKey(onClose)
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
  const [editingRates,    setEditingRates]    = useState<Set<string>>(new Set())

  const [cashCollected,      setCashCollected]      = useState('')
  const [upiCollected,       setUpiCollected]       = useState('')
  const [cardCollected,      setCardCollected]      = useState('')
  const [fleetCardCollected, setFleetCardCollected] = useState('')
  const [creditTotal,      setCreditTotal]      = useState('')
  const [creditRows,       setCreditRows]       = useState<CreditRow[]>([])
  const [expandedCreditId, setExpandedCreditId] = useState<number | null>(null)
  const [discrepancyReason, setDiscrepancyReason] = useState('')
  const [error,             setError]             = useState<string | null>(null)

  // ── Data queries ──────────────────────────────────────────────────────────

  const { data: definitions = [], isLoading: defsLoading } = useQuery({
    queryKey: ['shift-definitions-for-date', pumpId, shiftDate],
    queryFn:  () => shiftDefinitionApi.getForDate(pumpId, shiftDate),
    enabled:  !!shiftDate,
  })

  useEffect(() => {
    setShiftDefinitionId(definitions.length === 1 ? definitions[0].id : null)
  }, [definitions])

  const { data: dus = [], isLoading: dusLoading } = useQuery({
    queryKey: ['dus', pumpId],
    queryFn:  () => shiftApi.getDUs(pumpId),
  })

  const { data: operators = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['operators', pumpId],
    queryFn:  () => userApi.getOperators(pumpId),
  })

  // Fetch historical fuel prices for the selected date
  const { data: pricesForDate = [] } = useQuery({
    queryKey: ['fuel-prices-for-date', pumpId, shiftDate],
    queryFn:  () => fuelPriceApi.getForDate(pumpId, shiftDate),
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

  // Reset nozzle + rate state when DU changes
  useEffect(() => {
    setSelectedNozzleIds(new Set())
    setOpeningReadings({})
    setClosingReadings({})
  }, [selectedDU])

  // Reset rate inputs and overrides when date changes (prices will be re-fetched)
  useEffect(() => {
    setFuelRateInputs({})
    setEditingRates(new Set())
  }, [shiftDate])

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
    return diff >= 0 ? diff : null
  }

  // Effective rate: override input if user is editing, DB price if available, else manual input
  function getEffectiveRate(fuelType: string): number | null {
    if (editingRates.has(fuelType)) {
      const input = parseFloat(fuelRateInputs[fuelType] ?? '')
      return isFinite(input) && input > 0 ? input : null
    }
    const dbPrice = dbPriceMap[fuelType]
    if (typeof dbPrice === 'number') return dbPrice
    const input = parseFloat(fuelRateInputs[fuelType] ?? '')
    return isFinite(input) && input > 0 ? input : null
  }

  // Per-nozzle expected amount and totals
  const { nozzleExpected, totalExpected, allRatesResolved } = useMemo(() => {
    const nozzleExpected: Record<number, number | null> = {}
    let total: number | null = 0
    let allResolved = true

    for (const nozzleId of selectedNozzleIds) {
      const nozzle = availableNozzles.find(n => n.id === nozzleId)
      const liters = litersForNozzle(nozzleId)
      const rate = nozzle ? getEffectiveRate(nozzle.fuelType) : null

      if (liters !== null && rate !== null) {
        nozzleExpected[nozzleId] = parseFloat((liters * rate).toFixed(2))
        if (total !== null) total += nozzleExpected[nozzleId]!
      } else {
        nozzleExpected[nozzleId] = null
        total = null
      }

      if (nozzle && getEffectiveRate(nozzle.fuelType) === null) allResolved = false
    }

    return { nozzleExpected, totalExpected: total, allRatesResolved: allResolved }
  }, [selectedNozzleIds, openingReadings, closingReadings, dbPriceMap, fuelRateInputs, editingRates, availableNozzles])

  // Credit total as number
  const creditNum = safeParse(creditTotal)

  // Total collected (payment)
  const totalCollected = safeParse(cashCollected) + safeParse(upiCollected) + safeParse(cardCollected) + safeParse(fleetCardCollected) + creditNum

  // Expected total including credit
  const expectedWithCredit = totalExpected !== null ? parseFloat((totalExpected + creditNum).toFixed(2)) : null
  const discrepancyAmt = expectedWithCredit !== null ? parseFloat((totalCollected - expectedWithCredit).toFixed(2)) : null

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
    onError: (err) => setError(parseApiError(err, 'Failed to backfill shift. Please try again.')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!shiftDate)           return setError('Please select a shift date.')
    if (!shiftDefinitionId)   return setError('Please select a shift window.')
    if (!selectedDU)          return setError('Please select a Dispensary Unit.')
    if (!operatorId)          return setError('Please select an operator.')
    if (selectedNozzleIds.size === 0) return setError('Please select at least one nozzle.')

    // Validate that all fuel rates are provided
    for (const fuelType of selectedFuelTypes) {
      if (getEffectiveRate(fuelType) === null) {
        return setError(`Enter the fuel rate for ${FUEL_LABELS[fuelType] ?? fuelType} on ${shiftDate}.`)
      }
    }

    const nozzleReadings: BackfillNozzleReading[] = []
    for (const nozzleId of selectedNozzleIds) {
      const opening = parseFloat(openingReadings[nozzleId] ?? '')
      const closing = parseFloat(closingReadings[nozzleId] ?? '')
      const nozzle  = availableNozzles.find((n) => n.id === nozzleId)
      if (!isFinite(opening) || opening < 0)
        return setError(`Opening reading is required for nozzle #${nozzle?.nozzleNumber ?? nozzleId}.`)
      if (!isFinite(closing) || closing < 0)
        return setError(`Closing reading is required for nozzle #${nozzle?.nozzleNumber ?? nozzleId}.`)
      if (closing < opening)
        return setError(`Closing reading cannot be less than opening for nozzle #${nozzle?.nozzleNumber ?? nozzleId}.`)
      nozzleReadings.push({ nozzleId, openingReading: opening, closingReading: closing })
    }

    const creditEntries: CreditEntryInput[] = []
    for (const row of creditRows) {
      if (!row.clientName.trim())
        return setError('Client name is required for all credit entries.')
      const amt = parseFloat(row.amount)
      if (!isFinite(amt) || amt <= 0)
        return setError(`Amount must be greater than 0 for credit entry: "${row.clientName}".`)
      creditEntries.push({
        clientName:  row.clientName.trim(),
        amount:      amt,
        fuelType:    row.fuelType || undefined,
        billNo:      row.billNo.trim() || undefined,
        description: row.description.trim() || undefined,
      })
    }

    // Build fuelRateOverrides: for fuel types with no DB price, or when user overrode a DB price
    const fuelRateOverrides: Record<string, number> = {}
    for (const fuelType of selectedFuelTypes) {
      const dbPrice    = dbPriceMap[fuelType]
      const isOverride = editingRates.has(fuelType)
      if (dbPrice === null || dbPrice === undefined || isOverride) {
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
      creditTotal:        safeParse(creditTotal),
      creditEntries,
      discrepancyReason: discrepancyReason.trim() || undefined,
      fuelRateOverrides: Object.keys(fuelRateOverrides).length > 0 ? fuelRateOverrides : undefined,
    })
  }

  const isPending = mutation.isPending
  const canSubmit = !!shiftDate && !!shiftDefinitionId && !!selectedDU && !!operatorId && selectedNozzleIds.size > 0

  const selectedOperator = operators.find((o) => o.id === operatorId)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ModalPortal>
      <div className="ui-modal-backdrop" onClick={!isPending ? onClose : undefined}>
        <div
          className="ui-modal-panel w-full max-w-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div
            className="ui-modal-header ui-modal-header--themed"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}
          >
            <div className="ui-modal-heading">
              <h2 className="ui-modal-title">Backfill Historical Shift</h2>
              <p className="ui-modal-subtitle">
                Record past shift data (up to 365 days back). Tanker deliveries for the shift date must be logged first — the system will block submission if stock is insufficient.
              </p>
            </div>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" disabled={isPending}>
              ×
            </button>
          </div>

          {/* ── Scrollable form ──────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="ui-modal-body space-y-4">

              {/* ── Shift Details ──────────────────────────────────────── */}
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 space-y-3">
                <SectionLabel>Shift Details</SectionLabel>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ui-label">Shift Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={shiftDate}
                      min={minDate()}
                      max={maxDate()}
                      onChange={(e) => { setShiftDate(e.target.value); setShiftDefinitionId(null) }}
                      className="ui-input"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">Last 365 days · not today</p>
                  </div>

                  <div>
                    <label className="ui-label">Dispensary Unit <span className="text-red-500">*</span></label>
                    <SearchableSelect
                      value={String(selectedDU?.id ?? '')}
                      onChange={(v) => setSelectedDU(dus.find((d) => String(d.id) === v) ?? null)}
                      options={dus.map((du) => ({ value: String(du.id), label: `${du.name} (DU #${du.duNumber})` }))}
                      placeholder={dusLoading ? 'Loading…' : 'Select DU…'}
                      disabled={dusLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="ui-label">Shift Window <span className="text-red-500">*</span></label>
                  {definitions.length === 0 && !defsLoading ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      No shift definitions found for this pump. Configure shift windows in Setup first.
                    </div>
                  ) : (
                    <SearchableSelect
                      value={String(shiftDefinitionId ?? '')}
                      onChange={(v) => setShiftDefinitionId(v ? Number(v) : null)}
                      options={definitions.map((def) => ({ value: String(def.id), label: `${def.name} · ${def.windowLabel}` }))}
                      placeholder={defsLoading ? 'Loading windows…' : 'Select shift window…'}
                      disabled={defsLoading}
                    />
                  )}
                </div>
              </div>

              {/* ── Staff & Nozzles ────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <SectionLabel>Staff &amp; Nozzles</SectionLabel>

                <div>
                  <label className="ui-label">Operator on Duty <span className="text-red-500">*</span></label>
                  {operatorsLoading ? (
                    <div className="ui-input text-slate-400 text-sm">Loading operators…</div>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Search by name or ID…"
                        value={operatorSearch}
                        onChange={(e) => setOperatorSearch(e.target.value)}
                        className="ui-input mb-1.5"
                      />
                      <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
                        {filteredOperators.length === 0 ? (
                          <p className="text-xs text-slate-400 px-3 py-2">No operators found.</p>
                        ) : (
                          filteredOperators.map((op) => (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => { setOperatorId(op.id); setOperatorSearch('') }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                operatorId === op.id
                                  ? 'bg-violet-50 text-violet-700 font-semibold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {op.fullName}
                              <span className="ml-2 text-xs text-slate-400 font-mono">{op.employeeId}</span>
                            </button>
                          ))
                        )}
                      </div>
                      {selectedOperator && (
                        <p className="text-xs text-violet-700 mt-1 font-medium">
                          Selected: {selectedOperator.fullName}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {selectedDU && (
                  <div>
                    <label className="ui-label">Nozzles <span className="text-red-500">*</span></label>
                    {availableNozzles.length === 0 ? (
                      <p className="text-xs text-slate-400">No nozzles configured on this DU.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {availableNozzles.map((nozzle) => {
                          const selected = selectedNozzleIds.has(nozzle.id)
                          return (
                            <button
                              key={nozzle.id}
                              type="button"
                              onClick={() => toggleNozzle(nozzle.id)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                selected
                                  ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                                  : 'border-slate-300 text-slate-600 bg-white hover:border-violet-400 hover:text-violet-700'
                              }`}
                            >
                              #{nozzle.nozzleNumber} · {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Fuel Rates ─────────────────────────────────────────── */}
              {selectedNozzleIds.size > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <SectionLabel>Fuel Rates on {shiftDate}</SectionLabel>
                    {editingRates.size > 0 && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 -mt-3">
                        {editingRates.size} override{editingRates.size > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {[...selectedFuelTypes].map((fuelType) => {
                    const dbPrice    = dbPriceMap[fuelType]
                    const hasPrice   = typeof dbPrice === 'number'
                    const isEditing  = editingRates.has(fuelType)

                    const startEditing = () => {
                      setEditingRates(prev => new Set([...prev, fuelType]))
                      setFuelRateInputs(r => ({ ...r, [fuelType]: dbPrice!.toFixed(2) }))
                    }
                    const cancelEditing = () => {
                      setEditingRates(prev => { const s = new Set(prev); s.delete(fuelType); return s })
                      setFuelRateInputs(r => { const n = { ...r }; delete n[fuelType]; return n })
                    }

                    return (
                      <div key={fuelType} className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors ${isEditing ? 'bg-amber-50/70 border border-amber-100' : ''}`}>
                        <span className="text-xs font-semibold text-slate-700 w-28 shrink-0">
                          {FUEL_LABELS[fuelType] ?? fuelType}
                        </span>

                        {hasPrice && !isEditing ? (
                          /* ── DB price, read-only display ── */
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1">
                              ₹{dbPrice!.toFixed(2)}/L
                            </span>
                            <span className="text-[11px] text-slate-400">from price history</span>
                            <button
                              type="button"
                              title="Override price for this shift"
                              onClick={startEditing}
                              className="ml-1 p-1 rounded-md text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        ) : (
                          /* ── Manual input (no DB price, or user override) ── */
                          <div className="flex items-center gap-2 flex-1">
                            <div className="relative flex-1 max-w-[140px]">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">₹</span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="0.00"
                                value={fuelRateInputs[fuelType] ?? ''}
                                onChange={(e) => setFuelRateInputs(r => ({ ...r, [fuelType]: e.target.value }))}
                                className="ui-input pl-6 text-sm"
                                autoFocus={isEditing}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400">/L</span>
                            {hasPrice && isEditing ? (
                              <button
                                type="button"
                                title="Reset to price history"
                                onClick={cancelEditing}
                                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
                              >
                                <RotateCcw size={11} strokeWidth={2} />
                                Reset
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 font-medium">
                                No price on record — enter manually
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Meter Readings ─────────────────────────────────────── */}
              {selectedNozzleIds.size > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <SectionLabel>Meter Readings</SectionLabel>
                  {[...selectedNozzleIds].map((nozzleId) => {
                    const nozzle = availableNozzles.find((n) => n.id === nozzleId)
                    if (!nozzle) return null
                    const liters = litersForNozzle(nozzleId)
                    const rate   = getEffectiveRate(nozzle.fuelType)
                    const amount = nozzleExpected[nozzleId]
                    return (
                      <div key={nozzleId} className="bg-white rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-600">
                            Nozzle #{nozzle.nozzleNumber} · {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
                          </p>
                          {amount !== null && (
                            <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded px-2 py-0.5">
                              ₹{fmt(amount)}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="ui-label text-xs">Opening <span className="text-red-500">*</span></label>
                            <input
                              type="number" min="0" step="0.01" placeholder="0.00"
                              value={openingReadings[nozzleId] ?? ''}
                              onChange={(e) => setOpeningReadings((r) => ({ ...r, [nozzleId]: e.target.value }))}
                              className="ui-input"
                              required
                            />
                          </div>
                          <div>
                            <label className="ui-label text-xs">Closing <span className="text-red-500">*</span></label>
                            <input
                              type="number" min="0" step="0.01" placeholder="0.00"
                              value={closingReadings[nozzleId] ?? ''}
                              onChange={(e) => setClosingReadings((r) => ({ ...r, [nozzleId]: e.target.value }))}
                              className="ui-input"
                              required
                            />
                          </div>
                        </div>
                        {liters !== null && liters >= 0 && rate !== null && (
                          <p className="mt-1.5 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{liters.toFixed(2)} L</span>
                            {' × '}
                            <span className="font-semibold text-slate-700">₹{rate.toFixed(2)}</span>
                            {' = '}
                            <span className="font-bold text-emerald-700">₹{fmt(liters * rate)}</span>
                          </p>
                        )}
                        {liters !== null && liters >= 0 && rate === null && (
                          <p className="mt-1.5 text-xs text-amber-600">{liters.toFixed(2)} L sold — enter fuel rate above to see expected amount</p>
                        )}
                        {liters !== null && liters < 0 && (
                          <p className="mt-1.5 text-xs text-red-600">Closing must be ≥ opening.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Credit Sales ───────────────────────────────────────── */}
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 space-y-3">
                <SectionLabel>Credit Sales</SectionLabel>

                <div>
                  <label className="ui-label text-xs">Credit Total (₹)</label>
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={creditTotal}
                    onChange={(e) => setCreditTotal(e.target.value)}
                    className="ui-input"
                  />
                </div>

                {creditRows.map((row) => {
                  const isExpanded = expandedCreditId === row._key
                  return (
                    <div key={row._key} className="bg-white rounded-lg border border-orange-200 overflow-hidden">
                      {!isExpanded ? (
                        <div className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="font-medium text-slate-700 truncate">
                            {row.clientName || 'New entry'}{row.amount ? ` · ₹${row.amount}` : ''}
                          </span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <button type="button" onClick={() => setExpandedCreditId(row._key)}
                              className="text-blue-600 hover:underline">Edit</button>
                            <button type="button" onClick={() => removeCreditRow(row._key)}
                              className="text-red-500 hover:text-red-700 p-0.5"><X size={13} strokeWidth={2} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="ui-label text-xs">Client Name <span className="text-red-500">*</span></label>
                              <input type="text" placeholder="Client name" value={row.clientName}
                                onChange={(e) => updateCreditRow(row._key, { clientName: e.target.value })}
                                className="ui-input" />
                            </div>
                            <div>
                              <label className="ui-label text-xs">Amount (₹) <span className="text-red-500">*</span></label>
                              <input type="number" min="0.01" step="0.01" placeholder="0.00" value={row.amount}
                                onChange={(e) => updateCreditRow(row._key, { amount: e.target.value })}
                                className="ui-input" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="ui-label text-xs">Fuel Type</label>
                              <select value={row.fuelType}
                                onChange={(e) => updateCreditRow(row._key, { fuelType: e.target.value })}
                                className="ui-input">
                                <option value="">— optional —</option>
                                {Object.entries(FUEL_LABELS).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="ui-label text-xs">Bill No.</label>
                              <input type="text" placeholder="optional" value={row.billNo}
                                onChange={(e) => updateCreditRow(row._key, { billNo: e.target.value })}
                                className="ui-input" />
                            </div>
                          </div>
                          <div>
                            <label className="ui-label text-xs">Description</label>
                            <input type="text" placeholder="optional" value={row.description}
                              onChange={(e) => updateCreditRow(row._key, { description: e.target.value })}
                              className="ui-input" />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <button type="button" onClick={() => removeCreditRow(row._key)}
                              className="text-xs text-red-500 hover:text-red-700">Remove entry</button>
                            <button
                              type="button"
                              disabled={!row.clientName.trim() || !row.amount}
                              onClick={() => setExpandedCreditId(null)}
                              className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs disabled:opacity-40"
                            >Done</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <button type="button" onClick={addCreditRow}
                  className="w-full border border-dashed border-orange-300 rounded-lg py-2 text-xs text-orange-600 hover:border-orange-400 hover:bg-orange-100/50 transition-colors">
                  + Add Credit Entry
                </button>
              </div>

              {/* ── Payment Collection ─────────────────────────────────── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <SectionLabel>Payment Collected</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'UPI (₹)',        value: upiCollected,       set: setUpiCollected },
                    { label: 'Card (₹)',        value: cardCollected,      set: setCardCollected },
                    { label: 'Fleet Card (₹)', value: fleetCardCollected, set: setFleetCardCollected },
                    { label: 'Cash (₹)',        value: cashCollected,      set: setCashCollected },
                  ].map(({ label, value, set }) => (
                    <div key={label}>
                      <label className="ui-label text-xs">{label}</label>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="ui-input"
                      />
                    </div>
                  ))}
                </div>

                {/* Expected vs Collected summary */}
                {expectedWithCredit !== null && selectedNozzleIds.size > 0 && allRatesResolved && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
                      <span>Expected (fuel + credit)</span>
                      <span className="font-semibold text-slate-800">₹{fmt(expectedWithCredit)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
                      <span>Collected (UPI + card + fleet + cash)</span>
                      <span className="font-semibold text-slate-800">₹{fmt(totalCollected)}</span>
                    </div>
                    {discrepancyAmt !== null && (
                      <div className={`flex items-center justify-between px-3 py-2 text-xs font-semibold ${
                        Math.abs(discrepancyAmt) < 0.01
                          ? 'text-emerald-700 bg-emerald-50'
                          : discrepancyAmt < 0
                          ? 'text-red-700 bg-red-50'
                          : 'text-amber-700 bg-amber-50'
                      }`}>
                        <span>
                          {Math.abs(discrepancyAmt) < 0.01 ? <span className="inline-flex items-center gap-1">Balanced<Check size={12} strokeWidth={2.5} /></span> : discrepancyAmt < 0 ? 'Short (under-collected)' : 'Over (excess collected)'}
                        </span>
                        <span>
                          {Math.abs(discrepancyAmt) < 0.01 ? '₹0.00' : `₹${fmt(Math.abs(discrepancyAmt))}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Discrepancy reason ──────────────────────────────────── */}
              <div>
                <label className="ui-label">
                  Discrepancy Reason
                  <span className="text-slate-400 font-normal ml-1 text-xs">(required if collected ≠ expected)</span>
                </label>
                <textarea
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  placeholder="Explain any difference between collected and expected amounts…"
                  rows={2}
                  className="ui-input resize-none"
                />
              </div>

              {error && (
                <div className="ui-alert ui-alert-error text-sm">{error}</div>
              )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <div className="ui-modal-footer">
              <button type="button" onClick={onClose} disabled={isPending} className="ui-btn ui-btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="ui-btn ui-btn-primary disabled:opacity-40"
                style={!isPending ? { background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', border: 'none' } : {}}
              >
                {isPending ? 'Saving…' : 'Save Historical Shift'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}
