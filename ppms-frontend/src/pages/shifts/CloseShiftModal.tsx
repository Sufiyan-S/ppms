import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import type { CloseShiftRequest, CreateHandoverRequest, HandoverResponse, Shift, ShiftStatus } from '../../types/shift'
import { formatIstDateTime } from '../../utils/date'
import { Modal } from '../../components/Modal'
import type { ModalTone } from '../../components/Modal'
import { parseApiError } from '../../utils/apiError'
import { useConfirmDiscard } from '../../hooks/useConfirmDiscard'
import { readDraft, removeDraft, useSaveDraft, writeDraft } from '../../hooks/useSaveDraft'
import { DiscardChangesDialog } from '../../components/DiscardChangesDialog'
import { DraftRestoredNotice } from '../../components/DraftRestoredNotice'
import { toPaise } from '../../utils/money'
import { attemptFor } from '../../utils/idempotencyKey'
import type { SubmitAttempt } from '../../utils/idempotencyKey'
import { FUEL_UNIT } from '../../constants/fuel'
import { codeLabel } from '../../constants/labels'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { emptyNum } from './components/creditRow'
import { Section, ReadingField } from './close/CloseShiftFields'
import { CreditSalesSection } from './close/CreditSalesSection'
import { PaymentSection } from './close/PaymentSection'
import { DiscrepancySection } from './close/DiscrepancySection'
import { CloseShiftFooter } from './close/CloseShiftFooter'
import { LateCloseNotice } from './close/LateCloseNotice'
import { computeCloseShiftTotals, needsOwnerApproval } from './close/closeShiftTotals'
import { stillNeededItems, stillNeededLabel } from './close/closeShiftChecklist'
import { CloseShiftSummaryBar, CloseShiftSummaryPanel } from './close/CloseShiftLiveSummary'
import type { LiveSummaryFigures, SoldUnits } from './close/CloseShiftLiveSummary'
import { buildCloseShiftRequest } from './close/closeShiftRequest'
import { useCloseShiftCreditRows } from './close/useCloseShiftCreditRows'
import { HandoverFields } from './close/HandoverFields'
import { EMPTY_HANDOVER_DETAILS } from './close/handoverDetails'
import { closeShiftDraftName, restoredCreditRows } from './close/closeShiftDraft'
import type { CloseShiftDraft } from './close/closeShiftDraft'
import { CloseShiftReview, CloseShiftReviewActions } from './close/CloseShiftReview'
import { CloseShiftSummary, CloseShiftSummaryActions } from './close/CloseShiftSummary'
import { HandoverReportPanel } from './modals/HandoverReportPanel'

interface Props {
  shift: Shift
  onClose: () => void
  /** Offered on the summary after a normal close: opens the next shift on the same DU and nozzles. */
  onOpenNextShift?: (duId: number, nozzleIds: number[]) => void
  /** Set to hand the shift over: it is closed and a new shift opens for the incoming operator. */
  handoverActiveShifts?: Shift[]
}

type Step = 'form' | 'review' | 'done'

/** From this width the live summary sits beside the form; below it, it is a bar above the buttons. */
const SIDE_SUMMARY_QUERY = '(min-width: 900px)'

interface ClosingFigures {
  totalDue: number
  totalCollected: number
  diff: number
  creditEntryCount: number
}

interface ClosedResult {
  closedShift: Shift | null
  status: ShiftStatus | undefined
  incomingOperatorName: string | null
}

const emptyEndReadings = (shift: Shift): Record<number, string> =>
  Object.fromEntries(shift.fuelReadings.map((r) => [r.nozzleId, '']))

export default function CloseShiftModal({ shift, onClose, onOpenNextShift, handoverActiveShifts }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const isHandover = handoverActiveShifts !== undefined
  const queryClient = useQueryClient()
  const draftName = closeShiftDraftName(shift.id, isHandover)
  const [restoredDraft, setRestoredDraft] = useState(() => readDraft<CloseShiftDraft>(draftName))
  const [step, setStep] = useState<Step>('form')
  const [serverError, setServerError] = useState<string | null>(null)
  const [noChangeNozzles, setNoChangeNozzles] = useState<Set<number>>(() => new Set(restoredDraft?.values.noChangeNozzleIds))

  /** Per-nozzle end readings: nozzleId → raw string input */
  const [endReadings, setEndReadings] = useState<Record<number, string>>(() =>
    ({ ...emptyEndReadings(shift), ...restoredDraft?.values.endReadings })
  )
  const [cash,              setCash]              = useState(() => restoredDraft?.values.cash ?? '')
  const [upi,               setUpi]               = useState(() => restoredDraft?.values.upi ?? '')
  const [card,              setCard]              = useState(() => restoredDraft?.values.card ?? '')
  const [fleetCard,         setFleetCard]         = useState(() => restoredDraft?.values.fleetCard ?? '')
  const [discrepancyReason, setDiscrepancyReason] = useState(() => restoredDraft?.values.discrepancyReason ?? '')
  const [handoverDetails,   setHandoverDetails]   = useState(() => restoredDraft?.values.handoverDetails ?? EMPTY_HANDOVER_DETAILS)
  const [submitAttempt,     setSubmitAttempt]     = useState<SubmitAttempt | null>(() => restoredDraft?.values.submitAttempt ?? null)
  const [reviewedRequest,   setReviewedRequest]   = useState<CloseShiftRequest | null>(null)
  const [reviewedFigures,   setReviewedFigures]   = useState<ClosingFigures | null>(null)
  const [closedResult,      setClosedResult]      = useState<ClosedResult | null>(null)
  const [printedShift,      setPrintedShift]      = useState<Shift | null>(null)
  const [printError,        setPrintError]        = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const stillNeededId = useId()
  const summaryBesideForm = useMediaQuery(SIDE_SUMMARY_QUERY)
  const previousStep = useRef<Step>(step)

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    titleRef.current?.focus()
  }, [step])

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn:  () => pumpApi.getCreditClients(shift.pumpId),
  })

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    staleTime: 5 * 60_000,
  })
  const escalationThreshold = pumps.find((p) => p.id === shift.pumpId)?.discrepancyEscalationThreshold ?? null

  const { data: operators = [] } = useQuery({
    queryKey: ['operators', shift.pumpId],
    queryFn:  () => userApi.getOperators(shift.pumpId),
    enabled:  isHandover,
  })
  const incomingOperatorName = operators.find((o) => o.id === handoverDetails.incomingOperatorId)?.fullName ?? null

  // The operator can add credit entries while this modal is open, so the list is reloaded rather than taken
  // from the snapshot the modal was opened with.
  const { data: latestShift, refetch: reloadShift } = useQuery({
    queryKey: ['shift', shift.pumpId, shift.id],
    queryFn:  () => shiftApi.getShift(shift.pumpId, shift.id),
    initialData: shift,
    initialDataUpdatedAt: 0,
    refetchInterval: 30_000,
    enabled: closedResult === null,
  })

  const availableFuelTypes = shift.fuelReadings.map((r) => r.fuelType)
  const {
    creditRows, expandedRowId, setExpandedRowId, clearCreditRows,
    addCreditRow, updateRow, updateRowMulti, selectClient, removeCreditRow, editRecordedEntry,
  } = useCloseShiftCreditRows(availableFuelTypes, creditClients, restoredCreditRows(restoredDraft?.values))

  // Void state for pre-recorded entries
  const [localVoidedIds,    setLocalVoidedIds]   = useState<Set<number>>(
    () => new Set((shift.creditEntries ?? []).filter(e => e.voidStatus === 'VOIDED').map(e => e.id))
  )

  // Entries that were saved mid-shift via "+ Credit"
  // Exclude voided entries and entries being replaced by an edited row so they don't inflate the subtotal
  const replacedEntryIds = new Set(creditRows.map(r => r.replacesEntryId).filter((id): id is number => id !== null))
  const preRecordedEntries = (latestShift.creditEntries ?? [])
    .filter(e => e.voidStatus !== 'VOIDED' && !localVoidedIds.has(e.id) && !replacedEntryIds.has(e.id))
  const preRecordedTotal   = preRecordedEntries.reduce((s, e) => s + e.amount, 0)

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
  const incomingChosen   = !isHandover || handoverDetails.incomingOperatorId !== null
  const missingReadingCount = shift.fuelReadings.filter((r) => (endReadings[r.nozzleId] ?? '') === '').length
  const stillNeeded = stillNeededItems({
    isHandover, incomingChosen, missingReadingCount, readingsBelowStart, paymentTouched,
    creditRows, hasDiscrepancy, reasonFilled,
  }).map((item) => stillNeededLabel(item, t))
  const canClose = stillNeeded.length === 0
  const hasUnsavedChanges = Object.values(endReadings).some(v => v !== '')
    || cash !== '' || upi !== '' || card !== '' || fleetCard !== ''
    || creditRows.length > 0 || discrepancyReason.trim() !== ''
    || handoverDetails.incomingOperatorId !== null || handoverDetails.notes.trim() !== ''

  // ── Draft kept on this device ───────────────────────────────────────────────

  const draftValues: CloseShiftDraft = {
    endReadings, noChangeNozzleIds: [...noChangeNozzles], cash, upi, card, fleetCard, discrepancyReason,
    handoverDetails, creditRows, submitAttempt,
  }
  useSaveDraft(draftName, draftValues, hasUnsavedChanges && closedResult === null)

  const discardRestoredEntries = () => {
    removeDraft(draftName)
    setRestoredDraft(null)
    setEndReadings(emptyEndReadings(shift))
    setNoChangeNozzles(new Set())
    setCash('')
    setUpi('')
    setCard('')
    setFleetCard('')
    setDiscrepancyReason('')
    setHandoverDetails(EMPTY_HANDOVER_DETAILS)
    clearCreditRows()
    setSubmitAttempt(null)
    setServerError(null)
  }

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

  const finishClosing = (result: ClosedResult) => {
    removeDraft(draftName)
    queryClient.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
    queryClient.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
    setClosedResult(result)
    setStep('done')
  }

  const showSubmitError = (fallback: string) => (err: unknown) => {
    setServerError(parseApiError(err, fallback))
    reloadShift()
  }

  const closeMutation = useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: CloseShiftRequest; idempotencyKey: string }) =>
      shiftApi.closeShift(shift.pumpId, shift.id, request, idempotencyKey),
    onSuccess: (closedShift) =>
      finishClosing({ closedShift, status: closedShift?.status, incomingOperatorName: null }),
    onError: showSubmitError(t('close.errors.closeFailed')),
  })

  const handoverMutation = useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: CreateHandoverRequest; idempotencyKey: string }) =>
      shiftApi.createHandover(shift.pumpId, request, idempotencyKey),
    onSuccess: (handover: HandoverResponse) => finishClosing({
      closedShift: null,
      status: handover?.outgoingShiftStatus,
      incomingOperatorName: handover?.incomingOperatorName ?? incomingOperatorName,
    }),
    onError: showSubmitError(t('close.errors.handoverFailed')),
  })
  const isSubmitting = closeMutation.isPending || handoverMutation.isPending

  const printMutation = useMutation({
    mutationFn: () => shiftApi.getShift(shift.pumpId, shift.id),
    onSuccess: setPrintedShift,
    onError: (err: unknown) => setPrintError(parseApiError(err, t('close.errors.reportLoadFailed'))),
  })

  const handleReview = (e: React.FormEvent) => {
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
    setReviewedRequest(result.request)
    setReviewedFigures({ totalDue, totalCollected, diff, creditEntryCount: preRecordedEntries.length + creditRows.length })
    setStep('review')
  }

  // The key is saved with the draft before sending, so a resend after a timeout (even after a reload) reuses it.
  const keyFor = (request: unknown) => {
    const attempt = attemptFor(submitAttempt, request)
    setSubmitAttempt(attempt)
    writeDraft(draftName, { ...draftValues, submitAttempt: attempt })
    return attempt.key
  }

  const confirmClose = () => {
    if (!reviewedRequest) return
    setServerError(null)
    if (isHandover && handoverDetails.incomingOperatorId !== null) {
      const request: CreateHandoverRequest = {
        outgoingShiftId: shift.id,
        incomingOperatorId: handoverDetails.incomingOperatorId,
        physicalCashVerified: handoverDetails.physicalCashVerified,
        meterReadingsVerified: handoverDetails.meterReadingsVerified,
        notes: handoverDetails.notes.trim() || undefined,
        closing: reviewedRequest,
      }
      handoverMutation.mutate({ request, idempotencyKey: keyFor(request) })
      return
    }
    closeMutation.mutate({ request: reviewedRequest, idempotencyKey: keyFor(reviewedRequest) })
  }

  const backToForm = () => {
    setServerError(null)
    setStep('form')
  }

  const printReport = () => {
    setPrintError(null)
    if (closedResult?.closedShift?.id) setPrintedShift(closedResult.closedShift)
    else printMutation.mutate()
  }

  const handleRoundOff = () => {
    const newCashPaise = toPaise(emptyNum(cash)) - diffPaise
    if (newCashPaise < 0) {
      setServerError(t('close.errors.roundOffNegative'))
      return
    }
    setCash(newCashPaise === 0 ? '' : (newCashPaise / 100).toFixed(2))
  }

  const restInCashPaise = Math.max(0,
    toPaise(totalDue) - toPaise(emptyNum(upi)) - toPaise(emptyNum(card)) - toPaise(emptyNum(fleetCard)) - toPaise(creditTotal))

  const soldByUnit = perFuelSales
    .filter(({ reading }) => (endReadings[reading.nozzleId] ?? '') !== '')
    .reduce<SoldUnits[]>((totals, { reading, sold }) => {
      const unit = FUEL_UNIT[reading.fuelType] ?? 'L'
      const existing = totals.find((total) => total.unit === unit)
      return existing
        ? totals.map((total) => (total === existing ? { unit, amount: total.amount + sold } : total))
        : [...totals, { unit, amount: sold }]
    }, [])
  const summaryFigures: LiveSummaryFigures = {
    sold: soldByUnit,
    totalDue: soldByUnit.length > 0 ? totalDue : null,
    payments: paymentTouched
      ? { cash: emptyNum(cash), upi: emptyNum(upi), card: emptyNum(card), fleetCard: emptyNum(fleetCard), credit: creditTotal }
      : null,
    totalCollected: paymentTouched ? totalCollected : null,
    diff: isBalanced || hasDiscrepancy ? diff : null,
    approvalLimit: hasDiscrepancy && needsOwnerApproval(diff, escalationThreshold) ? escalationThreshold : null,
  }

  const closeAndForget = () => {
    removeDraft(draftName)
    onClose()
  }
  const { requestClose, isConfirming, discard, keepEditing } = useConfirmDiscard(hasUnsavedChanges, closeAndForget)

  // Closing is a completing action, so the header is success; it changes only once the totals show a real difference.
  const totalsEntered = readingsComplete && paymentTouched
  const headerTone: ModalTone = totalsEntered && hasDiscrepancy
    ? diff < 0 ? 'danger' : 'warning'
    : 'success'

  const title = step === 'review'
    ? isHandover ? t('close.title.reviewHandover') : t('close.title.reviewClose')
    : step === 'done'
    ? isHandover ? t('close.title.handedOver') : t('close.title.closed')
    : isHandover ? t('close.title.handover') : t('close.title.close')

  const dismiss = step === 'done' ? onClose : step === 'review' ? backToForm : requestClose

  if (printedShift) {
    return <HandoverReportPanel shift={printedShift} onClose={() => setPrintedShift(null)} />
  }

  const footer = step === 'form' ? (
    <>
      {!summaryBesideForm && (
        <CloseShiftSummaryBar figures={summaryFigures} stillNeeded={stillNeeded} stillNeededId={stillNeededId} />
      )}
      <CloseShiftFooter canReview={canClose} isHandover={isHandover} stillNeededId={stillNeededId} onCancel={requestClose} />
    </>
  ) : step === 'review' && reviewedFigures ? (
    <CloseShiftReviewActions isHandover={isHandover} isSubmitting={isSubmitting} onConfirm={confirmClose} onEdit={backToForm} />
  ) : step === 'done' && reviewedFigures && closedResult ? (
    <CloseShiftSummaryActions
      isPreparingPrint={printMutation.isPending}
      onPrint={printReport}
      onOpenNextShift={onOpenNextShift && !isHandover
        ? () => onOpenNextShift(shift.duId, shift.nozzles.map((n) => n.id))
        : undefined}
      onDone={onClose}
    />
  ) : null

  return (
    <>
    <Modal
      title={title}
      subtitle={t('close.subtitle', { nozzles: shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', '), operator: shift.operatorName, window: shift.shiftWindow })}
      tone={headerTone}
      size={step === 'form' ? 'full' : 'lg'}
      onClose={dismiss}
      canClose={!isSubmitting}
      confirmDiscard={false}
      titleRef={titleRef}
      fullScreenOnPhone={step !== 'form'}
      onSubmit={step === 'form' ? handleReview : undefined}
      bodyClassName={step === 'form' ? '' : step === 'review' ? 'space-y-5 text-sm text-ink' : 'space-y-4 text-sm text-ink'}
      footer={footer}
      footerClassName={step === 'form'
        ? 'flex-col items-stretch'
        : step === 'review' ? 'ui-modal-footer--large' : 'ui-modal-footer--large grid grid-cols-2'}
    >
        {step === 'review' && reviewedFigures && (
          <CloseShiftReview
            isHandover={isHandover}
            incomingOperatorName={incomingOperatorName}
            lines={perFuelSales.map(({ reading, sold, value }) => ({
              nozzleId: reading.nozzleId,
              label: t('close.nozzleLine', { number: nozzleNumberById[reading.nozzleId] ?? '?', fuel: codeLabel(reading.fuelType) }),
              units: sold,
              unit: FUEL_UNIT[reading.fuelType] ?? 'L',
              amount: value,
            }))}
            totalDue={reviewedFigures.totalDue}
            payments={{ cash: emptyNum(cash), upi: emptyNum(upi), card: emptyNum(card), fleetCard: emptyNum(fleetCard), credit: creditTotal }}
            creditEntryCount={reviewedFigures.creditEntryCount}
            totalCollected={reviewedFigures.totalCollected}
            diff={reviewedFigures.diff}
            discrepancyReason={discrepancyReason}
            escalationThreshold={escalationThreshold}
            serverError={serverError}
          />
        )}

        {step === 'done' && reviewedFigures && closedResult && (
          <CloseShiftSummary
            incomingOperatorName={closedResult.incomingOperatorName}
            totalDue={reviewedFigures.totalDue}
            totalCollected={reviewedFigures.totalCollected}
            diff={reviewedFigures.diff}
            creditEntryCount={reviewedFigures.creditEntryCount}
            isEscalated={closedResult.status === 'CLOSED_DISCREPANCY_PENDING_APPROVAL'}
            printError={printError}
          />
        )}

        {step === 'form' && (
          <div className={summaryBesideForm ? 'ui-close-layout' : undefined}>
            <div className="min-w-0 space-y-5">
              {restoredDraft && (
                <DraftRestoredNotice savedAt={restoredDraft.savedAt} onDiscard={discardRestoredEntries} />
              )}

              {isLateClose && scheduledEndDisplay && (
                <LateCloseNotice scheduledEndDisplay={scheduledEndDisplay} />
              )}

              {isHandover && handoverActiveShifts && (
                <HandoverFields
                  shift={shift}
                  activeShifts={handoverActiveShifts}
                  details={handoverDetails}
                  onChange={setHandoverDetails}
                />
              )}

              <Section label="1" title={t('close.sections.endReadings')}>
                <div className="ui-close-readings">
                  {perFuelSales.map(({ reading, sold, isBelowStart }, index) => (
                    <ReadingField
                      key={reading.nozzleId}
                      label={t('close.nozzleLine', { number: nozzleNumberById[reading.nozzleId] ?? '?', fuel: codeLabel(reading.fuelType) })}
                      startValue={reading.startReading}
                      soldUnits={sold}
                      pricePerUnit={reading.priceSnapshot}
                      value={endReadings[reading.nozzleId] ?? ''}
                      onChange={(v) => setEndReadings((prev) => ({ ...prev, [reading.nozzleId]: v }))}
                      unitLabel={FUEL_UNIT[reading.fuelType] ?? 'L'}
                      isInvalid={isBelowStart}
                      noChange={noChangeNozzles.has(reading.nozzleId)}
                      onNoChangeToggle={() => toggleNoChange(reading.nozzleId, reading.startReading)}
                      focusOnOpen={index === 0}
                    />
                  ))}
                </div>
              </Section>

              <CreditSalesSection
                shift={shift}
                preRecordedEntries={preRecordedEntries}
                preRecordedTotal={preRecordedTotal}
                onEditRecorded={editRecordedEntry}
                onVoidedRecorded={(entryId) => setLocalVoidedIds(prev => new Set([...prev, entryId]))}
                creditRows={creditRows}
                newCreditTotal={newCreditTotal}
                expandedRowId={expandedRowId}
                onExpandedChange={setExpandedRowId}
                creditClients={creditClients}
                availableFuelTypes={availableFuelTypes}
                priceForFuelType={priceForFuelType}
                onAddRow={addCreditRow}
                onUpdateRow={updateRow}
                onUpdateRowMulti={updateRowMulti}
                onSelectClient={selectClient}
                onRemoveRow={removeCreditRow}
              />

              <PaymentSection
                cash={cash} upi={upi} card={card} fleetCard={fleetCard}
                onCashChange={setCash} onUpiChange={setUpi} onCardChange={setCard} onFleetCardChange={setFleetCard}
                restInCashPaise={restInCashPaise}
                creditTotal={creditTotal}
              />

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
                <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>
              )}
            </div>

            {summaryBesideForm && (
              <CloseShiftSummaryPanel figures={summaryFigures} stillNeeded={stillNeeded} stillNeededId={stillNeededId} />
            )}
          </div>
        )}
    </Modal>
    {isConfirming && <DiscardChangesDialog formName={title} onDiscard={discard} onKeepEditing={keepEditing} />}
    </>
  )
}
