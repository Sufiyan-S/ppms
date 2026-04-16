import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import type { CloseShiftRequest, CreditEntryInput, FuelReading, Shift } from '../../types/shift'
import { SearchableSelect } from '../../components/SearchableSelect'
import { ModalPortal } from '../../components/ModalPortal'
import { maskPhone } from '../../utils/maskPhone'
import { parseApiError } from '../../utils/apiError'

interface Props {
  shift: Shift
  onClose: () => void
}

interface CreditRow {
  id: number
  clientId: number | null        // selected root/parent account id
  clientName: string
  clientSearch: string
  showDropdown: boolean
  subAccountId: number | null    // optional: selected sub-account id
  subAccountName: string
  fuelType: string
  billNo: string
  amount: string
  liters: string
  inputMode: 'amount' | 'liters'
  description: string
}

const FUEL_LABELS: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
  DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}
const FUEL_UNIT: Record<string, string> = {
  PETROL: 'L', SPEED_PETROL: 'L', DIESEL: 'L', SPEED_DIESEL: 'L', CNG: 'kg',
}

const emptyNum = (v: string) => (v === '' ? 0 : Number(v))
let nextRowId = 1

export default function CloseShiftModal({ shift, onClose }: Props) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  /** Per-nozzle end readings: nozzleId → raw string input */
  const [endReadings, setEndReadings] = useState<Record<number, string>>(() =>
    Object.fromEntries(shift.fuelReadings.map((r) => [r.nozzleId, '']))
  )
  const [cash,              setCash]              = useState('')
  const [upi,               setUpi]               = useState('')
  const [card,              setCard]              = useState('')
  const [fleetCard,         setFleetCard]         = useState('')
  // creditRows = entries being added NOW at close time (not pre-recorded ones)
  const [creditRows,        setCreditRows]        = useState<CreditRow[]>([])
  const [expandedRowId,     setExpandedRowId]     = useState<number | null>(null)
  const [discrepancyReason, setDiscrepancyReason] = useState('')

  // Void state for pre-recorded entries
  const [localVoidedIds,    setLocalVoidedIds]   = useState<Set<number>>(
    () => new Set((shift.creditEntries ?? []).filter(e => e.voidStatus === 'VOIDED').map(e => e.id))
  )
  const [voidingEntryId,    setVoidingEntryId]   = useState<number | null>(null)
  const [voidReasonInput,   setVoidReasonInput]  = useState('')
  const [voidError,         setVoidError]        = useState<string | null>(null)

  // Entries that were saved mid-shift via "+ Credit"
  // Exclude already-voided entries so they don't inflate the subtotal
  const preRecordedEntries = (shift.creditEntries ?? []).filter(e => !localVoidedIds.has(e.id))
  const preRecordedTotal   = preRecordedEntries.reduce((s, e) => s + e.amount, 0)

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn:  () => pumpApi.getCreditClients(shift.pumpId),
  })

  // Fuel types dispensed on this nozzle (for credit entry dropdown)
  const availableFuelTypes = shift.fuelReadings.map((r) => r.fuelType)

  // nozzleId → nozzleNumber — used to label each meter reading field
  const nozzleNumberById: Record<number, number> = Object.fromEntries(
    shift.nozzles.map((n) => [n.id, n.nozzleNumber])
  )

  // ── Live calculations ───────────────────────────────────────────────────────

  const perFuelSales: Array<{ reading: FuelReading; sold: number; value: number }> =
    shift.fuelReadings.map((r) => {
      const endRaw = endReadings[r.nozzleId] ?? ''
      const sold = endRaw !== '' ? Math.max(0, Number(endRaw) - r.startReading) : 0
      const value = sold * r.priceSnapshot
      return { reading: r, sold, value }
    })

  const totalDue       = perFuelSales.reduce((s, x) => s + x.value, 0)
  const newCreditTotal = creditRows.reduce((s, r) => s + emptyNum(r.amount), 0)
  // creditTotal for the close request = pre-recorded entries + new entries added here
  const creditTotal    = preRecordedTotal + newCreditTotal
  const totalCollected = emptyNum(cash) + emptyNum(upi) + emptyNum(card) + emptyNum(fleetCard) + creditTotal
  const diff           = totalCollected - totalDue

  const readingsComplete = shift.fuelReadings.every((r) => (endReadings[r.nozzleId] ?? '') !== '')
  const readingsBelowStart = shift.fuelReadings.some((r) => {
    const v = endReadings[r.nozzleId] ?? ''
    return v !== '' && Number(v) < r.startReading
  })
  // Consider "touched" if any payment field has a value, OR if pre-recorded credit exists
  const paymentTouched   = cash !== '' || upi !== '' || card !== '' || fleetCard !== '' || creditTotal > 0
  const isBalanced       = readingsComplete && !readingsBelowStart && paymentTouched && Math.abs(diff) < 0.01
  const hasDiscrepancy   = readingsComplete && !readingsBelowStart && paymentTouched && Math.abs(diff) >= 0.01
  const reasonFilled     = discrepancyReason.trim().length > 0
  const canClose         = isBalanced || (hasDiscrepancy && reasonFilled)

  // ── Credit row helpers ──────────────────────────────────────────────────────

  const addCreditRow = () => {
    const newId = nextRowId++
    setCreditRows((rows) => [...rows, {
      id: newId,
      clientId: null, clientName: '', clientSearch: '',
      showDropdown: false,
      subAccountId: null, subAccountName: '',
      fuelType: availableFuelTypes[0] ?? '',
      billNo: '', amount: '', liters: '', inputMode: 'amount', description: '',
    }])
    setExpandedRowId(newId)
  }

  const updateRow = <K extends keyof CreditRow>(id: number, field: K, value: CreditRow[K]) =>
    setCreditRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))

  const updateRowMulti = (id: number, updates: Partial<CreditRow>) =>
    setCreditRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...updates } : r)))

  const priceForFuelType = (ft: string): number | null =>
    shift.fuelReadings.find((r) => r.fuelType === ft)?.priceSnapshot ?? null

  const selectClient = (rowId: number, clientId: number, clientName: string) =>
    setCreditRows((rows) => rows.map((r) =>
      r.id === rowId
        ? { ...r, clientId, clientName, clientSearch: clientName, showDropdown: false, subAccountId: null, subAccountName: '' }
        : r
    ))

  const removeCreditRow = (id: number) => {
    setCreditRows((rows) => rows.filter((r) => r.id !== id))
    if (expandedRowId === id) setExpandedRowId(null)
  }

  // ── Pre-recorded entry void ─────────────────────────────────────────────────

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: (_, { entryId }) => {
      setLocalVoidedIds(prev => new Set([...prev, entryId]))
      setVoidingEntryId(null)
      setVoidReasonInput('')
      setVoidError(null)
      queryClient.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
    },
    onError: (err: unknown) => setVoidError(parseApiError(err, 'Failed to delete entry. Please try again.')),
  })

  const startVoid = (entryId: number) => {
    setVoidingEntryId(entryId)
    setVoidReasonInput('')
    setVoidError(null)
  }

  const startEdit = (e: typeof preRecordedEntries[0]) => {
    // Void the original, then pre-fill a new credit row with its data
    voidMutation.mutate(
      { entryId: e.id, reason: 'Edited — replaced by corrected entry' },
      {
        onSuccess: () => {
          const newId = nextRowId++
          setCreditRows(rows => [...rows, {
            id: newId,
            clientId: null, clientName: e.clientName, clientSearch: e.clientName,
            showDropdown: false,
            subAccountId: null, subAccountName: '',
            fuelType: e.fuelType ?? availableFuelTypes[0] ?? '',
            billNo: e.billNo ?? '',
            amount: String(e.amount),
            liters: '',
            inputMode: 'amount',
            description: e.description ?? '',
          }])
          setExpandedRowId(newId)
        },
      }
    )
  }

  // Price lookup per fuel type (for liters display)
  const priceFor = (ft: string | null) =>
    ft ? (shift.fuelReadings.find(r => r.fuelType === ft)?.priceSnapshot ?? null) : null

  // ── Submit ──────────────────────────────────────────────────────────────────

  const closeMutation = useMutation({
    mutationFn: (req: CloseShiftRequest) => shiftApi.closeShift(shift.pumpId, shift.id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      queryClient.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) =>
      setServerError(parseApiError(err, 'Failed to close shift. Please try again.')),
  })

  /** Parses a numeric string, returns null if the result is NaN, Infinity, or negative. */
  const safeParse = (v: string, max = 9_999_999): number | null => {
    const n = Number(v)
    if (!isFinite(n) || n < 0 || n > max) return null
    return n
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!canClose) return

    if (readingsBelowStart) {
      setServerError('End reading cannot be less than the start reading. Please correct the highlighted fields.')
      return
    }

    for (const row of creditRows) {
      if (!row.clientName.trim()) { setServerError('Each credit entry must have a client.'); return }
      if (!row.fuelType)          { setServerError('Each credit entry must have a fuel type.'); return }
      if (emptyNum(row.amount) <= 0) { setServerError('Each credit entry amount must be > 0.'); return }
    }

    for (const r of shift.fuelReadings) {
      const parsed = safeParse(endReadings[r.nozzleId] ?? '')
      if (parsed === null) {
        setServerError('End reading contains an invalid value. Please re-enter.')
        return
      }
    }

    const paymentFields = [
      { label: 'Cash',       val: cash },
      { label: 'UPI',        val: upi },
      { label: 'Card',       val: card },
      { label: 'Fleet Card', val: fleetCard },
    ]
    for (const f of paymentFields) {
      if (f.val !== '' && safeParse(f.val) === null) {
        setServerError(`${f.label} amount contains an invalid value.`)
        return
      }
    }

    const creditEntries: CreditEntryInput[] = creditRows.map((r) => ({
      clientId:    r.subAccountId ?? r.clientId ?? undefined,
      clientName:  r.clientName.trim(),
      billNo:      r.billNo.trim() || undefined,
      amount:      emptyNum(r.amount),
      fuelType:    r.fuelType || undefined,
      description: r.description.trim() || undefined,
    }))

    const req: CloseShiftRequest = {
      fuelReadings: shift.fuelReadings.map((r) => ({
        nozzleId:   r.nozzleId,
        endReading: Number(endReadings[r.nozzleId]),
      })),
      cashCollected:      emptyNum(cash),
      upiCollected:       emptyNum(upi),
      cardCollected:      emptyNum(card),
      fleetCardCollected: emptyNum(fleetCard),
      creditTotal,
      creditEntries,
      discrepancyReason: discrepancyReason.trim() || undefined,
    }
    closeMutation.mutate(req)
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const headerToneClass = isBalanced
    ? 'ui-modal-header--success'
    : hasDiscrepancy
    ? diff < 0 ? 'ui-modal-header--danger' : 'ui-modal-header--warning'
    : 'ui-modal-header--neutral'

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={`ui-modal-header ui-modal-header--themed ${headerToneClass} relative`}>
          <div className="ui-modal-heading pr-10">
            <h2 className="ui-modal-title">Close Shift</h2>
            <p className="ui-modal-subtitle">
              Nozzle {shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', ')} · {shift.operatorName} · {shift.shiftWindow}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="ui-btn ui-btn-ghost ui-modal-close absolute top-3 right-3">
            ×
          </button>

          {/* Locked price pills */}
          <div className="flex flex-wrap gap-2 mt-3">
            {shift.fuelReadings.map((r) => (
              <span key={r.nozzleId}
                className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                {FUEL_LABELS[r.fuelType] ?? r.fuelType} ₹{r.priceSnapshot}/{FUEL_UNIT[r.fuelType] ?? 'L'}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ui-modal-body space-y-5" style={{ maxHeight: 'calc(100vh - 15rem)' }}>

            {/* ── Step 1: End Readings ──────────────────────────────────── */}
            <Section label="1" title="End Meter Readings">
              <div className={`grid gap-3 ${shift.fuelReadings.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {perFuelSales.map(({ reading, sold }) => {
                  const endVal = endReadings[reading.nozzleId] ?? ''
                  const isInvalid = endVal !== '' && Number(endVal) < reading.startReading
                  return (
                    <ReadingField
                      key={reading.nozzleId}
                      label={`Nozzle #${nozzleNumberById[reading.nozzleId] ?? '?'} · ${FUEL_LABELS[reading.fuelType] ?? reading.fuelType} end (${FUEL_UNIT[reading.fuelType] ?? 'L'})`}
                      startValue={reading.startReading}
                      soldUnits={sold}
                      pricePerUnit={reading.priceSnapshot}
                      value={endVal}
                      onChange={(v) => setEndReadings((prev) => ({ ...prev, [reading.nozzleId]: v }))}
                      unitLabel={FUEL_UNIT[reading.fuelType] ?? 'L'}
                      isInvalid={isInvalid}
                    />
                  )
                })}
              </div>
            </Section>

            {/* ── Total due card ─────────────────────────────────────────── */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-500 font-medium uppercase tracking-wide">Total Due</p>
                <p className="text-xs text-blue-400 mt-0.5">meter reading × locked price</p>
              </div>
              <p className="text-2xl font-bold text-blue-700">₹{fmt(totalDue)}</p>
            </div>

            {/* ── Step 2: Payment Collected ─────────────────────────────── */}
            <Section label="2" title="Payment Collected">
              <div className="grid grid-cols-2 gap-3">
                <PaymentField label="Cash (₹)"        value={cash}      onChange={setCash} />
                <PaymentField label="UPI (₹)"         value={upi}       onChange={setUpi} />
                <PaymentField label="Card (₹)"        value={card}      onChange={setCard} />
                <PaymentField label="Fleet Card (₹)"  value={fleetCard} onChange={setFleetCard} />
              </div>
              {creditTotal > 0 && (
                <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2">
                  <span className="text-xs font-medium text-orange-700">Credit Sales Total</span>
                  <span className="text-sm font-bold text-orange-800">₹{fmt(creditTotal)}</span>
                </div>
              )}
            </Section>

            {/* ── Step 3: Credit Sales ──────────────────────────────────── */}
            <Section label="3" title="Credit Sales" optional>
              <div className="border border-orange-200 rounded-xl overflow-visible">

                {/* Pre-recorded entries (saved mid-shift) — with edit / delete */}
                {preRecordedEntries.length > 0 && (
                  <div className="px-4 py-2.5 bg-orange-50/70 border-b border-orange-100">
                    <p className="text-xs font-semibold text-orange-700 mb-2">
                      Pre-recorded during shift ({preRecordedEntries.length})
                    </p>
                    <div className="space-y-2">
                      {preRecordedEntries.map((e) => {
                        const price   = priceFor(e.fuelType)
                        const liters  = price ? (e.amount / price) : null
                        const unit    = e.fuelType === 'CNG' ? 'kg' : 'L'
                        const isVoiding = voidingEntryId === e.id

                        return (
                          <div key={e.id} className="ui-card-plain bg-white border-orange-100 p-0 overflow-hidden">
                            {/* Entry summary row */}
                            <div className="flex items-start justify-between px-3 py-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-slate-700">{e.clientName}</span>
                                  {e.fuelType && (
                                    <span className="text-xs text-slate-400 uppercase tracking-wide">{e.fuelType}</span>
                                  )}
                                  {e.billNo && (
                                    <span className="text-xs text-slate-400">#{e.billNo}</span>
                                  )}
                                </div>
                                {liters && price ? (
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {liters.toFixed(3)} {unit} × ₹{price} =&nbsp;
                                    <span className="font-semibold text-emerald-700">₹{fmt(e.amount)}</span>
                                  </p>
                                ) : (
                                  <p className="text-xs font-semibold text-emerald-700 mt-0.5">₹{fmt(e.amount)}</p>
                                )}
                                {e.description && (
                                  <p className="text-xs text-slate-400 italic mt-0.5">{e.description}</p>
                                )}
                              </div>
                              {!isVoiding && (
                                <div className="flex items-center gap-2 ml-3 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => startEdit(e)}
                                    disabled={voidMutation.isPending}
                                    className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors disabled:opacity-40"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startVoid(e.id)}
                                    className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-red-400 hover:text-red-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Inline void reason form */}
                            {isVoiding && (
                              <div className="border-t border-orange-100 bg-red-50/60 px-3 py-2">
                                <div className="ui-inline-form space-y-2 border-red-200 bg-white/70">
                                <input
                                  autoFocus
                                  type="text"
                                  value={voidReasonInput}
                                  onChange={e => setVoidReasonInput(e.target.value)}
                                  placeholder="Reason for deleting (required)"
                                  className="ui-input-compact text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                                />
                                {voidError && <p className="ui-error-text">{voidError}</p>}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setVoidingEntryId(null); setVoidReasonInput(''); setVoidError(null) }}
                                    className="ui-btn ui-btn-secondary min-h-0 flex-1 px-3 py-1 text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={voidMutation.isPending}
                                    onClick={() => {
                                      if (!voidReasonInput.trim()) { setVoidError('Reason is required'); return }
                                      voidMutation.mutate({ entryId: e.id, reason: voidReasonInput.trim() })
                                    }}
                                    className="ui-btn ui-btn-danger min-h-0 flex-1 px-3 py-1 text-xs disabled:opacity-50"
                                  >
                                    {voidMutation.isPending ? '…' : 'Confirm Delete'}
                                  </button>
                                </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-2 pt-1.5 border-t border-orange-100">
                      <span className="text-xs text-orange-600">Pre-recorded subtotal</span>
                      <span className="text-xs font-bold text-orange-700">₹{fmt(preRecordedTotal)}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50">
                  <div>
                    {creditRows.length > 0 ? (
                      <span className="text-xs text-orange-600 font-medium">
                        {creditRows.length} new {creditRows.length === 1 ? 'entry' : 'entries'} · ₹{fmt(newCreditTotal)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {preRecordedEntries.length > 0 ? 'Add more entries below' : 'No credit this shift'}
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={addCreditRow}
                    className="ui-btn ui-btn-warning min-h-0 px-3 py-1.5 text-xs">
                    + Add Entry
                  </button>
                </div>

                {creditRows.length > 0 && (
                  <div className="divide-y divide-orange-100">
                    {creditRows.map((row, idx) => {
                      const isExpanded = expandedRowId === row.id
                      const isFilled = row.clientName.trim() !== '' && emptyNum(row.amount) > 0
                      // Only root (parent/standalone) accounts in the main search
                      const rootClients = creditClients.filter(c => c.parentClientId === null)
                      const filtered = rootClients.filter((c) =>
                        c.name.toLowerCase().includes(row.clientSearch.toLowerCase())
                      )
                      const selectedParent = creditClients.find(c => c.id === row.clientId)
                      const subAccounts = selectedParent?.isParent
                        ? creditClients.filter(c => c.parentClientId === row.clientId)
                        : []

                      return (
                        <div key={row.id}>
                          {/* ── Collapsed summary row ── */}
                          {!isExpanded ? (
                            <div
                              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-orange-50 transition-colors group"
                              onClick={() => setExpandedRowId(row.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-bold text-orange-400 shrink-0">#{idx + 1}</span>
                                {isFilled ? (
                                  <>
                                    <span className="text-sm font-medium text-slate-700 truncate">{row.clientName}</span>
                                    <span className="text-xs text-slate-400 shrink-0">{FUEL_LABELS[row.fuelType] ?? row.fuelType}</span>
                                    <span className="text-sm font-semibold text-emerald-700 shrink-0">₹{fmt(emptyNum(row.amount))}</span>
                                    {row.billNo && <span className="text-xs text-slate-400 shrink-0">· {row.billNo}</span>}
                                  </>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Incomplete — tap to edit</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="text-xs text-orange-400 group-hover:text-orange-600 transition-colors">Edit</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); removeCreditRow(row.id) }}
                                  className="text-red-300 hover:text-red-600 text-sm transition-colors leading-none"
                                  title="Delete entry"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Expanded form ── */
                            <div className="px-4 py-3 space-y-2.5 bg-orange-50/40">
                              {/* Expanded header */}
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRowId(null)}
                                  className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-900 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                  Entry {idx + 1}
                                </button>
                                <button type="button" onClick={() => removeCreditRow(row.id)}
                                  className="text-red-400 hover:text-red-600 text-xs transition-colors">
                                  ✕ Delete
                                </button>
                              </div>

                              {/* Client search — root/parent accounts only */}
                              <div className="ui-search-shell">
                                <label className="ui-label">
                                  Client <span className="text-red-500">*</span>
                                </label>
                                <input type="text" value={row.clientSearch}
                                  onChange={(e) => {
                                    updateRow(row.id, 'clientSearch', e.target.value)
                                    updateRow(row.id, 'clientName', e.target.value)
                                    updateRow(row.id, 'clientId', null)
                                    updateRow(row.id, 'showDropdown', true)
                                  }}
                                  onFocus={() => updateRow(row.id, 'showDropdown', true)}
                                  onBlur={() => setTimeout(() => updateRow(row.id, 'showDropdown', false), 150)}
                                  placeholder="Search client name..."
                                  className="ui-search-shell__input text-sm"
                                />
                                {row.showDropdown && rootClients.length > 0 && (
                                  <div className="ui-card absolute top-full left-0 right-0 z-50 mt-0.5 max-h-36 overflow-y-auto p-1">
                                    {filtered.length === 0 ? (
                                      <p className="ui-empty px-3 py-2">
                                        No match — ask Owner to add this client in Setup.
                                      </p>
                                    ) : (
                                      filtered.map((c) => (
                                        <button key={c.id} type="button"
                                          onMouseDown={() => selectClient(row.id, c.id, c.name)}
                                          className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-orange-50 flex items-center justify-between">
                                          <span className="font-medium text-slate-700">{c.name}</span>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {c.isParent && (
                                              <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                                has sub-accounts
                                              </span>
                                            )}
                                            {c.phone && <span className="text-xs text-slate-400">{maskPhone(c.phone)}</span>}
                                          </div>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                                {creditClients.length === 0 && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    No clients added yet — Owner can add them in Setup.
                                  </p>
                                )}
                              </div>

                              {/* Sub-account picker — only shown when the selected parent has children */}
                              {subAccounts.length > 0 && (
                                <div>
                                  <label className="ui-label">
                                    Sub-account <span className="text-slate-400">(optional)</span>
                                  </label>
                                  <div className="ui-card p-0 overflow-hidden divide-y divide-slate-50 shadow-none border-slate-200">
                                    {/* "Bill to parent" option */}
                                    <button
                                      type="button"
                                      onClick={() => updateRowMulti(row.id, { subAccountId: null, subAccountName: '' })}
                                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left ${
                                        row.subAccountId === null ? 'bg-orange-50' : 'hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                        row.subAccountId === null ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'
                                      }`}>
                                        {row.clientName.charAt(0).toUpperCase()}
                                      </div>
                                      <span className={`flex-1 font-medium text-xs ${row.subAccountId === null ? 'text-orange-800' : 'text-slate-500'}`}>
                                        Bill to parent ({row.clientName})
                                      </span>
                                      {row.subAccountId === null && (
                                        <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </button>
                                    {/* Sub-account options */}
                                    {subAccounts.map(s => {
                                      const isSelected = row.subAccountId === s.id
                                      return (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => updateRowMulti(row.id, { subAccountId: s.id, subAccountName: s.name })}
                                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left ${
                                            isSelected ? 'bg-orange-50' : 'hover:bg-slate-50'
                                          }`}
                                        >
                                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                            isSelected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
                                          }`}>
                                            {s.name.charAt(0).toUpperCase()}
                                          </div>
                                          <span className={`flex-1 font-medium text-sm ${isSelected ? 'text-orange-800' : 'text-slate-700'}`}>
                                            {s.name}
                                          </span>
                                          {s.phone && (
                                            <span className="text-xs text-slate-400 shrink-0">{s.phone}</span>
                                          )}
                                          {isSelected && (
                                            <svg className="w-3.5 h-3.5 text-orange-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Fuel type + Amount/Liters */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="ui-label">
                                    Fuel Type <span className="text-red-500">*</span>
                                  </label>
                                  <SearchableSelect
                                    value={row.fuelType}
                                    onChange={v => updateRowMulti(row.id, {
                                      fuelType: v,
                                      amount: row.inputMode === 'liters' ? '' : row.amount,
                                      liters: '',
                                    })}
                                    placeholder="Select…"
                                    accentColor="orange"
                                    size="sm"
                                    options={availableFuelTypes.map(ft => ({
                                      value: ft,
                                      label: FUEL_LABELS[ft] ?? ft,
                                    }))}
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="ui-label mb-0">
                                      {row.inputMode === 'amount' ? 'Amount (₹)' : 'Liters'}{' '}
                                      <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex rounded border border-slate-200 overflow-hidden text-xs">
                                      <button type="button"
                                        onClick={() => updateRowMulti(row.id, { inputMode: 'amount', liters: '' })}
                                        className={`px-2 py-0.5 font-medium transition-colors ${row.inputMode === 'amount' ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                                        ₹
                                      </button>
                                      <button type="button"
                                        onClick={() => {
                                          const price = priceForFuelType(row.fuelType)
                                          const initLiters = price && row.amount
                                            ? (parseFloat(row.amount) / price).toFixed(3)
                                            : ''
                                          updateRowMulti(row.id, { inputMode: 'liters', liters: initLiters })
                                        }}
                                        disabled={!priceForFuelType(row.fuelType)}
                                        className={`px-2 py-0.5 font-medium transition-colors ${row.inputMode === 'liters' ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                                        L
                                      </button>
                                    </div>
                                  </div>
                                  {row.inputMode === 'amount' ? (
                                    <>
                                      <input type="number" step="0.01" min="0.01" value={row.amount}
                                        onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                                        placeholder="0.00"
                                        className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                                      {(() => {
                                        const price = priceForFuelType(row.fuelType)
                                        const unit = FUEL_UNIT[row.fuelType] ?? 'L'
                                        const litersCalc = price && row.amount ? (parseFloat(row.amount) / price) : null
                                        return litersCalc ? (
                                          <p className="text-xs text-slate-400 mt-1">
                                            {litersCalc.toFixed(3)} {unit} × ₹{price} = ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        ) : null
                                      })()}
                                    </>
                                  ) : (
                                    <>
                                      <input type="number" step="0.001" min="0.001" value={row.liters}
                                        onChange={(e) => {
                                          const price = priceForFuelType(row.fuelType)
                                          const raw = parseFloat(e.target.value)
                                          const amt = price && isFinite(raw) && raw >= 0 && raw <= 99_999
                                            ? (raw * price).toFixed(2)
                                            : ''
                                          updateRowMulti(row.id, { liters: e.target.value, amount: amt })
                                        }}
                                        placeholder="0.000"
                                        className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                                      {row.liters && row.amount && (() => {
                                        const price = priceForFuelType(row.fuelType)
                                        const unit = FUEL_UNIT[row.fuelType] ?? 'L'
                                        return price ? (
                                          <p className="text-xs text-emerald-600 mt-1 font-medium">
                                            {parseFloat(row.liters).toFixed(3)} {unit} × ₹{price} = ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        ) : null
                                      })()}
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Bill No + Description */}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="ui-label">Bill No</label>
                                  <input type="text" value={row.billNo}
                                    onChange={(e) => updateRow(row.id, 'billNo', e.target.value)}
                                    placeholder="e.g. B-101"
                                    className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                                </div>
                                <div>
                                  <label className="ui-label">Description</label>
                                  <input type="text" value={row.description}
                                    onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                                    placeholder="e.g. given to driver"
                                    className="ui-input-compact focus:outline-none focus:ring-1 focus:ring-orange-400" />
                                </div>
                              </div>

                              {/* Add / Cancel actions */}
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => removeCreditRow(row.id)}
                                  className="ui-btn ui-btn-ghost text-xs px-3 py-1.5 min-h-0"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!row.clientId || emptyNum(row.amount) <= 0) return
                                    setExpandedRowId(null)
                                  }}
                                  disabled={!row.clientId || emptyNum(row.amount) <= 0}
                                  className="ui-btn ui-btn-warning text-xs px-3 py-1.5 min-h-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Section>

            {/* ── Balance status card ───────────────────────────────────── */}
            {paymentTouched && readingsComplete && (
              <BalanceCard totalDue={totalDue} totalCollected={totalCollected} diff={diff} fmt={fmt} />
            )}

            {/* ── Discrepancy reason ────────────────────────────────────── */}
            {hasDiscrepancy && (
              <div className={`border-2 rounded-xl overflow-hidden ${diff < 0 ? 'border-red-300' : 'border-amber-300'}`}>
                <div className={`px-4 py-3 flex items-start gap-3 ${diff < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${diff < 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                    !
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${diff < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {diff < 0 ? `Shift is SHORT by ₹${fmt(Math.abs(diff))}` : `Shift has EXCESS of ₹${fmt(diff)}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {diff < 0 ? 'The operator collected less than the amount due.' : 'The operator collected more than the amount due.'}
                      {' '}Add a reason below to close this shift.
                    </p>
                  </div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Reason <span className="text-red-500">*</span>
                    <span className="text-slate-400 font-normal ml-1">(required to close)</span>
                  </label>
                  <textarea value={discrepancyReason} onChange={(e) => setDiscrepancyReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Customer paid partial — balance pending, meter error, etc."
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                      reasonFilled ? 'border-emerald-300 focus:ring-emerald-400' : 'border-slate-300 focus:ring-amber-400'
                    }`}
                  />
                  {!reasonFilled && (
                    <p className="text-xs text-amber-600 mt-1">↑ Enter a reason to enable closing</p>
                  )}
                </div>
              </div>
            )}

            {serverError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm">{serverError}</p>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="ui-modal-footer bg-slate-50/80">
            <button type="button" onClick={onClose}
              className="ui-btn ui-btn-secondary flex-none">
              Cancel
            </button>
            <div className="flex-1">
              {!readingsComplete || !paymentTouched ? (
                <button type="submit" disabled
                  className="ui-btn w-full bg-slate-200 text-slate-400 cursor-not-allowed">
                  Fill in readings &amp; payment to continue
                </button>
              ) : isBalanced ? (
                <button type="submit" disabled={closeMutation.isPending}
                  className="ui-btn w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                  {closeMutation.isPending ? 'Closing...' : '✓ Close Shift — Balanced'}
                </button>
              ) : reasonFilled ? (
                <button type="submit" disabled={closeMutation.isPending}
                  className="ui-btn w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white">
                  {closeMutation.isPending ? 'Closing...' : '⚠ Close with Discrepancy'}
                </button>
              ) : (
                <button type="submit" disabled
                  className="ui-btn w-full bg-amber-100 text-amber-400 cursor-not-allowed border-2 border-amber-200 border-dashed">
                  Add a reason above to close
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ label, title, optional = false, children }: {
  label: string; title: string; optional?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {label}
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {optional && <span className="text-xs text-slate-400">(optional)</span>}
      </div>
      {children}
    </div>
  )
}

function ReadingField({ label, startValue, soldUnits, pricePerUnit, value, onChange, unitLabel, isInvalid }: {
  label: string; startValue: number; soldUnits: number; pricePerUnit: number;
  value: string; onChange: (v: string) => void; unitLabel: string; isInvalid?: boolean
}) {
  const saleValue = soldUnits > 0 ? soldUnits * pricePerUnit : null

  return (
    <div>
      <label className="ui-label">{label}</label>
      <div className="flex flex-col gap-0.5 text-xs text-slate-400 mb-1">
        <span>Start: <span className="font-medium text-slate-500">{startValue}</span></span>
        {value !== '' && !isInvalid && soldUnits > 0 && (
          <span className="text-slate-500">
            <span className="font-medium">{value}</span>
            {' − '}
            <span className="font-medium">{startValue}</span>
            {' = '}
            <span className="font-semibold text-emerald-600">{soldUnits.toFixed(3)} {unitLabel}</span>
          </span>
        )}
        {soldUnits > 0 && (
          <span className="text-blue-500 font-medium">
            {soldUnits.toFixed(3)} {unitLabel} × ₹{pricePerUnit}
            {saleValue != null && (
              <span className="text-emerald-600"> = ₹{saleValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            )}
          </span>
        )}
      </div>
      <input type="number" step="0.001" min="0" required value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`text-sm ${
          isInvalid
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-slate-300 focus:ring-blue-500'
        }`}
        placeholder="Enter end reading"
      />
      {isInvalid && (
        <p className="ui-error-text mt-1">
          End reading cannot be less than start ({startValue})
        </p>
      )}
    </div>
  )
}

function PaymentField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="ui-label">{label}</label>
      <input type="number" step="0.01" min="0" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="text-sm"
      />
    </div>
  )
}

function BalanceCard({ totalDue, totalCollected, diff, fmt }: {
  totalDue: number; totalCollected: number; diff: number; fmt: (n: number) => string
}) {
  const isBalanced = Math.abs(diff) < 0.01
  return (
    <div className={`rounded-xl border-2 overflow-hidden ${
      isBalanced ? 'border-emerald-300' : diff < 0 ? 'border-red-300' : 'border-amber-300'
    }`}>
      <div className={`px-4 py-3 flex items-center justify-between ${
        isBalanced ? 'bg-emerald-50' : diff < 0 ? 'bg-red-50' : 'bg-amber-50'
      }`}>
        <div className="text-xs text-slate-500 flex gap-6">
          <span>Due: <span className="font-semibold text-slate-700">₹{fmt(totalDue)}</span></span>
          <span>Collected: <span className="font-semibold text-slate-700">₹{fmt(totalCollected)}</span></span>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${
          isBalanced ? 'text-emerald-700' : diff < 0 ? 'text-red-700' : 'text-amber-700'
        }`}>
          {isBalanced ? '✓ Balanced' : diff < 0 ? `↓ SHORT ₹${fmt(Math.abs(diff))}` : `↑ OVER ₹${fmt(diff)}`}
        </div>
      </div>
    </div>
  )
}
