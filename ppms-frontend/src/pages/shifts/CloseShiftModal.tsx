import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import type { CloseShiftRequest, Shift } from '../../types/shift'
import { formatIstDateTime } from '../../utils/date'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { useConfirmDiscard } from '../../hooks/useConfirmDiscard'
import { DiscardChangesDialog } from '../../components/DiscardChangesDialog'
import { toPaise } from '../../utils/money'
import { FUEL_LABELS, FUEL_UNIT } from '../../constants/fuel'
import { CreditEntryForm } from './components/CreditEntryForm'
import { emptyNum, fmt } from './components/creditRow'
import { PreRecordedCreditList } from './close/PreRecordedCreditList'
import { Section, ReadingField, PaymentField, BalanceCard } from './close/CloseShiftFields'
import { DiscrepancySection } from './close/DiscrepancySection'
import { CloseShiftFooter } from './close/CloseShiftFooter'
import { LateCloseNotice } from './close/LateCloseNotice'
import { computeCloseShiftTotals } from './close/closeShiftTotals'
import { buildCloseShiftRequest } from './close/closeShiftRequest'
import { useCloseShiftCreditRows } from './close/useCloseShiftCreditRows'
import { IconButton } from '../../components/IconButton'

interface Props {
  shift: Shift
  onClose: () => void
  onShiftClosed?: (duId: number, nozzleIds: number[]) => void
}

export default function CloseShiftModal({ shift, onClose, onShiftClosed }: Props) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [noChangeNozzles, setNoChangeNozzles] = useState<Set<number>>(new Set())

  /** Per-nozzle end readings: nozzleId → raw string input */
  const [endReadings, setEndReadings] = useState<Record<number, string>>(() =>
    Object.fromEntries(shift.fuelReadings.map((r) => [r.nozzleId, '']))
  )
  const [cash,              setCash]              = useState('')
  const [upi,               setUpi]               = useState('')
  const [card,              setCard]              = useState('')
  const [fleetCard,         setFleetCard]         = useState('')
  const [discrepancyReason, setDiscrepancyReason] = useState('')

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn:  () => pumpApi.getCreditClients(shift.pumpId),
  })

  const availableFuelTypes = shift.fuelReadings.map((r) => r.fuelType)
  const {
    creditRows, expandedRowId, setExpandedRowId,
    addCreditRow, updateRow, updateRowMulti, selectClient, removeCreditRow, editRecordedEntry,
  } = useCloseShiftCreditRows(availableFuelTypes, creditClients)

  // Void state for pre-recorded entries
  const [localVoidedIds,    setLocalVoidedIds]   = useState<Set<number>>(
    () => new Set((shift.creditEntries ?? []).filter(e => e.voidStatus === 'VOIDED').map(e => e.id))
  )

  // Entries that were saved mid-shift via "+ Credit"
  // Exclude voided entries and entries being replaced by an edited row so they don't inflate the subtotal
  const replacedEntryIds = new Set(creditRows.map(r => r.replacesEntryId).filter((id): id is number => id !== null))
  const preRecordedEntries = (shift.creditEntries ?? [])
    .filter(e => !localVoidedIds.has(e.id) && !replacedEntryIds.has(e.id))
  const preRecordedTotal   = preRecordedEntries.reduce((s, e) => s + e.amount, 0)


  // Fuel types dispensed on this nozzle (for credit entry dropdown)

  // nozzleId → nozzleNumber — used to label each meter reading field
  const nozzleNumberById: Record<number, number> = Object.fromEntries(
    shift.nozzles.map((n) => [n.id, n.nozzleNumber])
  )

  // ── Scheduled end time alert ────────────────────────────────────────────────
  // When closing past the shift's defined end, actualEndTime will be snapped back to
  // the scheduled boundary. Warn the operator so they aren't surprised.
  const scheduledEnd = shift.scheduledEndTime ? new Date(shift.scheduledEndTime) : null
  const isLateClose  = scheduledEnd !== null && new Date() > scheduledEnd
  const scheduledEndDisplay = scheduledEnd
    ? formatIstDateTime(scheduledEnd, { hour: '2-digit', minute: '2-digit', hour12: true })
    : null

  // ── Live calculations ───────────────────────────────────────────────────────

  const newCreditTotal = creditRows.reduce((s, r) => s + emptyNum(r.amount), 0)
  const {
    perFuelSales, totalDue, creditTotal, totalCollected, diffPaise, diff,
    readingsComplete, readingsBelowStart, paymentTouched, isBalanced, hasDiscrepancy, canRoundOff,
  } = computeCloseShiftTotals({
    fuelReadings: shift.fuelReadings, endReadings, noChangeNozzles,
    cash, upi, card, fleetCard, preRecordedTotal, newCreditTotal,
  })
  const reasonFilled     = discrepancyReason.trim().length > 0
  const canClose         = isBalanced || (hasDiscrepancy && reasonFilled)
  const hasUnsavedChanges = Object.values(endReadings).some(v => v !== '')
    || cash !== '' || upi !== '' || card !== '' || fleetCard !== ''
    || creditRows.length > 0 || discrepancyReason.trim() !== ''

  // ── Credit row helpers ──────────────────────────────────────────────────────

  const priceForFuelType = (ft: string): number | null =>
    shift.fuelReadings.find((r) => r.fuelType === ft)?.priceSnapshot ?? null

  const toggleNoChange = (nozzleId: number, startReading: number) => {
    const wasNoChange = noChangeNozzles.has(nozzleId)
    setNoChangeNozzles(prev => {
      const next = new Set(prev)
      if (wasNoChange) next.delete(nozzleId)
      else next.add(nozzleId)
      return next
    })
    setEndReadings(prev => ({ ...prev, [nozzleId]: wasNoChange ? '' : String(startReading) }))
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const closeMutation = useMutation({
    mutationFn: (req: CloseShiftRequest) => shiftApi.closeShift(shift.pumpId, shift.id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      queryClient.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
      onShiftClosed?.(shift.duId, shift.nozzles.map(n => n.id))
      onClose()
    },
    onError: (err: unknown) =>
      setServerError(parseApiError(err, 'Failed to close shift. Please try again.')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!canClose) return

    const result = buildCloseShiftRequest({
      fuelReadings: shift.fuelReadings, endReadings, readingsBelowStart, creditRows,
      cash, upi, card, fleetCard, creditTotal, discrepancyReason,
    })
    if ('error' in result) {
      setServerError(result.error)
      return
    }
    closeMutation.mutate(result.request)
  }

  const handleRoundOff = () => {
    const newCashPaise = toPaise(emptyNum(cash)) - diffPaise
    if (newCashPaise < 0) {
      setServerError('Round off not possible: cash amount would become negative.')
      return
    }
    setCash(newCashPaise === 0 ? '' : (newCashPaise / 100).toFixed(2))
  }

  const { requestClose, isConfirming, discard, keepEditing } = useConfirmDiscard(hasUnsavedChanges, onClose)

  // Stays neutral until readings and payments are in; an empty form is not a shortage.
  const totalsEntered = readingsComplete && paymentTouched
  const headerToneClass = !totalsEntered
    ? 'ui-modal-header--neutral'
    : isBalanced
    ? 'ui-modal-header--success'
    : hasDiscrepancy
    ? diff < 0 ? 'ui-modal-header--danger' : 'ui-modal-header--warning'
    : 'ui-modal-header--neutral'

  return (
    <ModalPortal onClose={closeMutation.isPending ? undefined : requestClose}>
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
          <IconButton label="Close" icon="×" onClick={requestClose} className="ui-btn ui-btn-ghost ui-modal-close absolute top-3 right-3" />

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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="ui-modal-body space-y-5">

            {/* ── Late-close notice ─────────────────────────────────────── */}
            {isLateClose && scheduledEndDisplay && (
              <LateCloseNotice scheduledEndDisplay={scheduledEndDisplay} />
            )}

            {/* ── Step 1: End Readings ──────────────────────────────────── */}
            <Section label="1" title="End Meter Readings">
              <div className={`grid gap-3 ${shift.fuelReadings.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {perFuelSales.map(({ reading, sold, isBelowStart }) => {
                  const isNoChange = noChangeNozzles.has(reading.nozzleId)
                  const endVal = endReadings[reading.nozzleId] ?? ''
                  const isInvalid = isBelowStart
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
                      noChange={isNoChange}
                      onNoChangeToggle={() => toggleNoChange(reading.nozzleId, reading.startReading)}
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

            {/* ── Step 2: Credit Sales ─────────────────────────────────── */}
            <Section label="2" title="Credit Sales" optional>
              <div className="border border-orange-200 rounded-xl overflow-visible">

                {/* Pre-recorded entries (saved mid-shift) — with edit / delete */}
                {preRecordedEntries.length > 0 && (
                  <PreRecordedCreditList
                    shift={shift}
                    entries={preRecordedEntries}
                    total={preRecordedTotal}
                    onEdit={editRecordedEntry}
                    onVoided={(entryId) => setLocalVoidedIds(prev => new Set([...prev, entryId]))}
                  />
                )}

                <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50">
                  <div>
                    {creditRows.length > 0 ? (
                      <span className="text-xs text-orange-600 font-medium">
                        {creditRows.length} new {creditRows.length === 1 ? 'entry' : 'entries'} · ₹{fmt(newCreditTotal)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
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
                    {creditRows.map((row, idx) => (
                      <CreditEntryForm
                        key={row.id}
                        row={row}
                        rowNumber={idx + 1}
                        isExpanded={expandedRowId === row.id}
                        onExpandedChange={setExpandedRowId}
                        creditClients={creditClients}
                        availableFuelTypes={availableFuelTypes}
                        priceForFuelType={priceForFuelType}
                        onUpdate={(field, value) => updateRow(row.id, field, value)}
                        onUpdateMulti={(updates) => updateRowMulti(row.id, updates)}
                        onSelectClient={(clientId, clientName) => selectClient(row.id, clientId, clientName)}
                        onRemove={() => removeCreditRow(row.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* ── Step 3: Payment Collected ────────────────────────────── */}
            <Section label="3" title="Payment Collected">
              <div className="grid grid-cols-2 gap-3">
                <PaymentField label="UPI (₹)"         value={upi}       onChange={setUpi} />
                <PaymentField label="Card (₹)"        value={card}      onChange={setCard} />
                <PaymentField label="Fleet Card (₹)"  value={fleetCard} onChange={setFleetCard} />
                <PaymentField label="Cash (₹)"        value={cash}      onChange={setCash} />
              </div>
              {creditTotal > 0 && (
                <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2">
                  <span className="text-xs font-medium text-orange-700">Credit Sales Total</span>
                  <span className="text-sm font-bold text-orange-800">₹{fmt(creditTotal)}</span>
                </div>
              )}
            </Section>

            {/* ── Balance status card ───────────────────────────────────── */}
            {paymentTouched && readingsComplete && (
              <BalanceCard totalDue={totalDue} totalCollected={totalCollected} diff={diff} fmt={fmt} />
            )}

            {/* ── Discrepancy reason ────────────────────────────────────── */}
            {hasDiscrepancy && (
              <DiscrepancySection
                diff={diff}
                canRoundOff={canRoundOff}
                onRoundOff={handleRoundOff}
                reason={discrepancyReason}
                onReasonChange={setDiscrepancyReason}
              />
            )}

            {serverError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm">{serverError}</p>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <CloseShiftFooter
            readingsComplete={readingsComplete}
            paymentTouched={paymentTouched}
            isBalanced={isBalanced}
            reasonFilled={reasonFilled}
            isPending={closeMutation.isPending}
            onCancel={requestClose}
          />
        </form>
      </div>
    </div>
    {isConfirming && <DiscardChangesDialog onDiscard={discard} onKeepEditing={keepEditing} />}
    </ModalPortal>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
