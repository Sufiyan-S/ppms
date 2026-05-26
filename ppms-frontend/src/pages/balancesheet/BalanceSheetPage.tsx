import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Check, BarChart2, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { pumpApi } from '../../api/pumpApi'
import { parseApiError } from '../../utils/apiError'
import type {
  BalanceSheetSummary,
  BsFuelLine,
  BsShiftLine,
  NozzleReadingLine,
  MeterAmendmentLine,
  DipPlLine,
  GenerateBalanceSheetRequest,
  ProductSalesSummary,
  ExpenseSummary,
  SettlementSummary,
} from '../../api/balanceSheetApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, formatIstDateTime } from '../../utils/date'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// ── Date helpers ───────────────────────────────────────────────────────────────
// Use local calendar date (not UTC) so the value matches the user's timezone.

function localDateStr(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Formatting helpers ──────────────────────────────────────────────────────────

const IST_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtMoney(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtLitres(n: number) {
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
}

function fmtDate(iso: string) {
  return formatIstDate(iso)
}

function fmtDateTime(iso: string) {
  return formatIstDateTime(iso)
}

const FUEL_BADGE: Record<string, string> = {
  PETROL:       'bg-emerald-100 text-emerald-700',
  DIESEL:       'bg-blue-100    text-blue-700',
  SPEED_PETROL: 'bg-violet-100  text-violet-700',
  CNG:          'bg-amber-100   text-amber-700',
}

// ── Generate Modal ──────────────────────────────────────────────────────────────

interface GenerateModalProps {
  pumpId: number
  onClose: () => void
}

function GenerateModal({ pumpId, onClose }: GenerateModalProps) {
  useEscapeKey(onClose)
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const [reportType, setReportType] = useState<'SHIFT' | 'DAY'>('SHIFT')
  const [reportDate, setReportDate] = useState(() => localDateStr(0))
  const [shiftDefinitionId, setShiftDefinitionId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [existingBsMsg, setExistingBsMsg] = useState<string | null>(null)

  const { data: shiftDefinitions = [], isLoading: defsLoading } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn: () => shiftDefinitionApi.getActive(pumpId),
    enabled: reportType === 'SHIFT',
  })

  // Auto-select first definition when definitions load (or when reportType switches to SHIFT)
  useEffect(() => {
    if (reportType === 'SHIFT' && shiftDefinitions.length > 0 && shiftDefinitionId === null) {
      setShiftDefinitionId(shiftDefinitions[0].id)
    }
    if (reportType === 'DAY') {
      setShiftDefinitionId(null)
    }
  }, [reportType, shiftDefinitions, shiftDefinitionId])

  const mutation = useMutation({
    mutationFn: (req: GenerateBalanceSheetRequest) => balanceSheetApi.generate(pumpId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast('Balance sheet generated successfully', 'success')
      onClose()
    },
    onError: (err: any) => {
      const msg: string = parseApiError(err, 'Failed to generate balance sheet')
      // Backend returns "already exists" — offer the user a re-generate option
      if (msg.includes('already exists')) {
        setConfirmRegenerate(true)
        setExistingBsMsg(msg)
        setError(null)
      } else {
        setError(msg)
        addToast(msg, 'error')
      }
    },
  })

  const buildReq = (force = false): GenerateBalanceSheetRequest => {
    const req: GenerateBalanceSheetRequest = {
      reportType,
      reportDate,
      notes: notes.trim() || undefined,
      forceRegenerate: force || undefined,
    }
    if (reportType === 'SHIFT' && shiftDefinitionId !== null) {
      req.shiftDefinitionId = shiftDefinitionId
    }
    return req
  }

  const handleSubmit = () => {
    setError(null)
    setConfirmRegenerate(false)
    mutation.mutate(buildReq())
  }

  const handleForceRegenerate = () => {
    setConfirmRegenerate(false)
    mutation.mutate(buildReq(true))
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel">
        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Generate Balance Sheet</h2>
            <p className="ui-modal-subtitle">Create a shift or day-end financial snapshot for this pump.</p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        {/* Body */}
        <div className="ui-modal-body space-y-4">
          {/* Report type toggle */}
          <div>
            <label className="ui-label">Report Type</label>
            <div className="ui-card-plain flex gap-1 p-1">
              {(['SHIFT', 'DAY'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setReportType(t)}
                  className={`ui-btn min-h-0 flex-1 px-3 py-2 text-sm font-medium ${
                    reportType === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'SHIFT' ? 'Shift Report' : 'Day-End Report'}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {reportType === 'SHIFT'
                ? 'Covers one shift. All shifts in that window must be closed first.'
                : 'Covers the full business day. All shifts should be closed before generating.'}
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="ui-label">Business Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="shadow-sm"
            />
          </div>

          {/* Shift (only for SHIFT reports) */}
          {reportType === 'SHIFT' && (
            <div>
              <label className="ui-label">Shift</label>
              {defsLoading ? (
                <p className="ui-help">Loading shifts…</p>
              ) : shiftDefinitions.length === 0 ? (
                <p className="text-xs text-red-500">No shift definitions configured for this pump. Please set them up in pump settings first.</p>
              ) : (
                <SearchableSelect
                  value={shiftDefinitionId !== null ? String(shiftDefinitionId) : ''}
                  onChange={v => setShiftDefinitionId(Number(v))}
                  options={shiftDefinitions.map(d => ({ value: String(d.id), label: `${d.name} · ${d.windowLabel}` }))}
                />
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="ui-label">Notes <span className="text-slate-400">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any remarks for this report…"
              className="resize-none shadow-sm"
            />
          </div>

          {confirmRegenerate && (
            <div className="ui-alert ui-alert-warning px-4 py-3 space-y-3">
              <p className="text-sm text-amber-800 font-medium">
                A balance sheet already exists for this period.
              </p>
              {existingBsMsg && (
                <p className="text-xs text-amber-700">{existingBsMsg}</p>
              )}
              <p className="text-xs text-amber-700">
                If you can't see it in the list, widen the date filter. Do you want to generate a new revision instead? It will be saved as a separate entry (e.g. Shift 1 · 12 AM – 8 AM #2).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleForceRegenerate}
                  disabled={mutation.isPending}
                  className="ui-btn min-h-0 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                >
                  {mutation.isPending
                    ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Generating…</span>
                    : 'Yes, generate revision'}
                </button>
                <button
                  onClick={() => setConfirmRegenerate(false)}
                  className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="ui-alert ui-alert-danger text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ui-modal-footer">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {mutation.isPending
              ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Generating…</span>
              : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Delete Confirm Modal ────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  report: BalanceSheetSummary
  pumpId: number
  onClose: () => void
}

function DeleteConfirmModal({ report, pumpId, onClose }: DeleteConfirmProps) {
  useEscapeKey(onClose)
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const mutation = useMutation({
    mutationFn: () => balanceSheetApi.delete(pumpId, report.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast('Balance sheet deleted', 'success')
      onClose()
    },
    onError: (err: any) => addToast(parseApiError(err, 'Failed to delete balance sheet'), 'error'),
  })

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--danger">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">Delete Balance Sheet?</h3>
            <p className="ui-modal-subtitle">This action removes the saved report entry.</p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>
        <div className="ui-modal-body">
          <p className="text-sm text-slate-600">
            This will permanently delete the <span className="font-medium">{report.periodLabel}</span> report
            for <span className="font-medium">{fmtDate(report.reportDate)}</span>.
            You can regenerate it afterwards.
          </p>
        </div>
        <div className="ui-modal-footer">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="ui-btn ui-btn-danger"
          >
            {mutation.isPending
              ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Deleting…</span>
              : 'Delete Report'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Detail Panel ────────────────────────────────────────────────────────────────

interface DetailPanelProps {
  pumpId: number
  reportId: number
  onClose: () => void
  canDelete: boolean
  onDelete: (summary: BalanceSheetSummary) => void
  summary: BalanceSheetSummary
  pumpName: string
}

function DetailPanel({ pumpId, reportId, onClose, canDelete, onDelete, summary, pumpName }: DetailPanelProps) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const { data: detail, isLoading } = useQuery({
    queryKey: ['balance-sheet-detail', pumpId, reportId],
    queryFn: () => balanceSheetApi.getById(pumpId, reportId),
  })

  if (isLoading || !detail) {
    return (
      <div className="flex-1 px-6 py-6">
        <SkeletonRows count={6} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible">
      {/* Detail header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              detail.reportType === 'DAY' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {detail.reportType === 'DAY' ? 'Day End' : 'Shift'}
            </span>
            <h2 className="text-base font-semibold text-slate-800">
              <span className="hidden print:inline">Balance Sheet — </span>{detail.periodLabel}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(detail.reportDate)} · Generated {fmtDateTime(detail.generatedAt)} by {detail.generatedByUserName}
            {pumpName && <span className="hidden print:inline"> · Pump: <span className="font-medium">{pumpName}</span></span>}
          </p>
          {detail.reportType === 'DAY' && detail.includedShiftNames && detail.includedShiftNames.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Shifts included:{' '}
              {detail.includedShiftNames.map(name => (
                <span key={name} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 mr-1">
                  {name}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={onClose}
            className="md:hidden text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Back
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(summary)}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="text-xs text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Print PDF
          </button>
          <button
            onClick={onClose}
            className="hidden md:block text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Notes */}
        {detail.notes && (
          <div className="ui-card-plain ui-card-muted px-4 py-3 text-sm text-slate-600">
            {detail.notes}
          </div>
        )}

        {/* Cash summary tiles */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Cash & Revenue Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryTile label="Expected Revenue" value={fmtMoney(detail.totalExpectedRevenue)} />
            <SummaryTile label="Cash Collected" value={fmtMoney(detail.totalCashCollected)} />
            <SummaryTile label="UPI Collected" value={fmtMoney(detail.totalUpiCollected)} />
            <SummaryTile label="Card Collected" value={fmtMoney(detail.totalCardCollected)} />
            <SummaryTile label="Credit Sold" value={fmtMoney(detail.totalCreditSold)} accent="amber" />
            {detail.reportType === 'DAY' && (
              <SummaryTile label="Credit Recovered" value={fmtMoney(detail.totalCreditRecovered)} accent="green" />
            )}
            {detail.reportType === 'DAY' && (detail.totalCashRecovery ?? 0) > 0 && (
              <SummaryTile label="Cash Recovery" value={fmtMoney(detail.totalCashRecovery)} accent="green" sublabel="Short discrepancy repaid" />
            )}
            <SummaryTile
              label="Cash Discrepancy"
              value={fmtMoney(Math.abs(detail.cashDiscrepancy))}
              sublabel={detail.cashDiscrepancy > 0 ? 'Over' : detail.cashDiscrepancy < 0 ? 'Short' : 'Balanced'}
              accent={detail.cashDiscrepancy === 0 ? 'green' : detail.cashDiscrepancy < 0 ? 'red' : 'amber'}
            />
            <SummaryTile label="Total Litres Sold" value={fmtLitres(detail.totalLitresSold)} />
            {detail.reportType === 'DAY' && (
              <SummaryTile label="Litres Delivered" value={fmtLitres(detail.totalLitresDelivered)} />
            )}
            {isOwnerOrAdmin && <SummaryTile label="Cost of Goods" value={fmtMoney(detail.totalCostOfGoods)} />}
            {isOwnerOrAdmin && (
              <SummaryTile
                label={detail.reportType === 'DAY' ? 'Fuel Gross Profit' : 'Gross Profit'}
                value={fmtMoney(detail.totalGrossProfit)}
                accent={detail.totalGrossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && detail.reportType === 'DAY' && detail.productSales && (
              <SummaryTile
                label="Product Sales Profit"
                value={fmtMoney(detail.productSales.grossProfit)}
                accent={detail.productSales.grossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {detail.reportType === 'DAY' && detail.expenses && (
              <SummaryTile
                label="Expenses"
                value={'−' + fmtMoney(detail.expenses.totalAmount)}
                accent="red"
              />
            )}
            {isOwnerOrAdmin && detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label="Dip P/L"
                value={(detail.totalDipNetAmount > 0 ? '+' : '') + fmtMoney(detail.totalDipNetAmount)}
                accent={detail.totalDipNetAmount > 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && (detail.reportType === 'DAY' ? (
              <SummaryTile
                label="Net Profit"
                value={fmtMoney(detail.totalNetProfit)}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ) : detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label="Net Profit"
                value={fmtMoney(detail.totalNetProfit)}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ))}
          {!isOwnerOrAdmin && (
            <p className="text-xs text-slate-400 col-span-full mt-1">
              Financial details (cost, profit, P/L) are visible to Owner and Admin only.
            </p>
          )}
          </div>
        </section>

        {/* Fuel lines */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Fuel Breakdown</h3>
          <div className="ui-table-wrap overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[900px] text-sm print:min-w-0 print:text-[8pt]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <Th>Fuel</Th>
                  <Th right>Opening Stock</Th>
                  <Th right>Delivered</Th>
                  <Th right>Sold</Th>
                  <Th right>Closing Stock</Th>
                  <Th right>Selling Price</Th>
                  <Th right>Revenue</Th>
                  {isOwnerOrAdmin && <Th right>COGS</Th>}
                  {isOwnerOrAdmin && <Th right>Profit</Th>}
                  <Th right>Stock Variance</Th>
                  {isOwnerOrAdmin && <Th right>Dip Loss</Th>}
                  <Th right>Credit Sold</Th>
                </tr>
              </thead>
              <tbody>
                {detail.fuelLines.map((line: BsFuelLine) => (
                  <FuelLineRow key={line.fuelType} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Shift lines */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Shift Breakdown <span className="text-slate-400 normal-case font-normal">({detail.shiftLines.length} shift{detail.shiftLines.length !== 1 ? 's' : ''})</span>
          </h3>
          <div className="ui-table-wrap overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[960px] text-xs print:min-w-0 print:text-[7pt]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <Th>Operator</Th>
                  <Th>DU / Nozzle</Th>
                  <Th>Fuels</Th>
                  <Th right>Litres</Th>
                  <Th right>Expected</Th>
                  <Th right>Received</Th>
                  <Th right>Cash</Th>
                  <Th right>UPI</Th>
                  <Th right>Card</Th>
                  <Th right>Fleet</Th>
                  <Th right>Credit</Th>
                  <Th right>Discrepancy</Th>
                </tr>
              </thead>
              <tbody>
                {detail.shiftLines.map((line: BsShiftLine) => (
                  <ShiftLineRow key={line.shiftId} line={line} />
                ))}
              </tbody>
              {detail.shiftLines.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700 border-t border-slate-200">
                    <Td colSpan={3}>Total</Td>
                    <Td right>{fmtLitres(detail.shiftLines.reduce((s, l) => s + l.litresSold, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.expectedRevenue, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cashCollected + l.upiCollected + l.cardCollected + (l.fleetCardCollected ?? 0), 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cashCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.upiCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cardCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + (l.fleetCardCollected ?? 0), 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.creditAmount, 0))}</Td>
                    <DiscrepancyTd value={detail.shiftLines.reduce((s, l) => s + l.discrepancy, 0)} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* Meter Reading Amendments — only shown when amendments occurred in this period */}
        {detail.meterAmendments?.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Meter Reading Amendments
              <span className="ml-2 text-slate-400 normal-case font-normal">
                ({detail.meterAmendments.length} amendment{detail.meterAmendments.length !== 1 ? 's' : ''} during this period)
              </span>
            </h3>
            <div className="ui-table-wrap overflow-x-auto border-amber-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50 text-left">
                    <Th>Fuel</Th>
                    <Th>Type</Th>
                    <Th right>Previous</Th>
                    <Th right>New</Th>
                    <Th right>Change</Th>
                    <Th>Reason</Th>
                    <Th>By</Th>
                    <Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.meterAmendments.map((a: MeterAmendmentLine) => {
                    const badge = FUEL_BADGE[a.fuelType] ?? 'bg-slate-100 text-slate-600'
                    const deltaColor = a.delta < 0 ? 'text-red-600' : a.delta > 0 ? 'text-amber-600' : 'text-slate-400'
                    return (
                      <tr key={a.id} className="border-t border-amber-100 hover:bg-amber-50 transition-colors">
                        <Td>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
                            {a.fuelType.replace('_', ' ')}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs font-medium text-slate-600">
                            {a.adjustmentType === 'RESET' ? 'Reset to 0' : 'Custom'}
                          </span>
                        </Td>
                        <Td right><span className="font-mono text-slate-600">{a.previousReading.toFixed(2)}</span></Td>
                        <Td right><span className="font-mono text-slate-700 font-medium">{a.newReading.toFixed(2)}</span></Td>
                        <Td right>
                          <span className={`font-medium ${deltaColor}`}>
                            {a.delta > 0 ? '+' : ''}{a.delta.toFixed(2)}
                          </span>
                        </Td>
                        <Td><span className="text-xs text-slate-500">{a.reason}</span></Td>
                        <Td><span className="text-xs text-slate-500">{a.recordedByUserName}</span></Td>
                        <Td>
                          <span className="text-xs text-slate-400">
                            {IST_TIME_FORMATTER.format(new Date(a.createdAt))}
                          </span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Dip P/L — shown when any dip activity (maintenance removal or dipstick check) occurred */}
        {isOwnerOrAdmin && detail.dipPlEntries?.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Dip P/L
              <span className="ml-2 text-slate-400 normal-case font-normal">
                ({detail.dipPlEntries.length} entr{detail.dipPlEntries.length !== 1 ? 'ies' : 'y'})
              </span>
            </h3>
            <div className="ui-table-wrap overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <Th>Type</Th>
                    <Th>Fuel</Th>
                    <Th right>Litres</Th>
                    <Th right>P/L</Th>
                    <Th>Time</Th>
                    <Th>Notes</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.dipPlEntries.map((entry: DipPlLine, idx: number) => {
                    const badge = FUEL_BADGE[entry.fuelType] ?? 'bg-slate-100 text-slate-600'
                    const isGain = entry.monetaryAmount > 0
                    const isLoss = entry.monetaryAmount < 0
                    const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-400'
                    const litresColor = entry.type === 'DIP_CHECK'
                      ? (entry.litres > 0 ? 'text-emerald-600' : entry.litres < 0 ? 'text-red-600' : 'text-slate-400')
                      : 'text-slate-700'
                    return (
                      <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                        <Td>
                          {entry.type === 'DIP_CHECK' ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                              Dip Check
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                              Maintenance
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
                            {entry.fuelType.replace('_', ' ')}
                          </span>
                        </Td>
                        <Td right>
                          <span className={`font-mono ${litresColor}`}>
                            {entry.type === 'DIP_CHECK' && entry.litres > 0 ? '+' : ''}{entry.litres.toFixed(2)} L
                          </span>
                        </Td>
                        <Td right>
                          <span className={`font-medium ${plColor}`}>
                            {isGain ? '+' : ''}{fmtMoney(entry.monetaryAmount)}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs text-slate-400">
                            {IST_TIME_FORMATTER.format(new Date(entry.recordedAt))}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-xs text-slate-500 max-w-[160px] truncate block" title={entry.notes ?? ''}>
                            {entry.notes ?? '—'}
                          </span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                    <Td colSpan={3}>Net Dip P/L</Td>
                    <Td right>
                      {(() => {
                        const net = detail.totalDipNetAmount
                        const color = net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-600' : 'text-slate-400'
                        return (
                          <span className={color}>
                            {net > 0 ? '+' : ''}{fmtMoney(net)}
                          </span>
                        )
                      })()}
                    </Td>
                    <Td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* Ancillary Product Sales — DAY reports only */}
        {detail.reportType === 'DAY' && detail.productSales && (
          <ProductSalesSection productSales={detail.productSales} />
        )}

        {/* Approved Expenses — DAY reports only */}
        {detail.reportType === 'DAY' && detail.expenses && (
          <ExpensesSection expenses={detail.expenses} />
        )}

        {/* Payment Settlements — DAY reports only */}
        {detail.reportType === 'DAY' && detail.settlementSummary && (
          <SettlementSection summary={detail.settlementSummary} />
        )}
      </div>
    </div>
  )
}

// ── Table sub-components ────────────────────────────────────────────────────────

function Th({ children, right, colSpan }: { children?: ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <th colSpan={colSpan} className={`px-2 py-2 print:px-1 print:py-1 text-[11px] font-semibold text-slate-500 whitespace-nowrap ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({ children, right, colSpan }: { children?: ReactNode; right?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-2 py-2 print:px-1 print:py-1 text-slate-700 ${right ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>
      {children}
    </td>
  )
}

function DiscrepancyTd({ value }: { value: number }) {
  const color = value === 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-amber-600'
  return (
    <td className={`px-2 py-2 print:px-1 print:py-1 text-right font-medium whitespace-nowrap tabular-nums ${color}`}>
      {value === 0 ? '—' : fmtMoney(Math.abs(value))}
      {value !== 0 && <span className="text-xs ml-1">{value < 0 ? 'Short' : 'Over'}</span>}
    </td>
  )
}

function FuelLineRow({ line }: { line: BsFuelLine }) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const badge = FUEL_BADGE[line.fuelType] ?? 'bg-slate-100 text-slate-600'
  const profitColor = line.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <Td>
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
          {line.fuelType.replace('_', ' ')}
        </span>
      </Td>
      <Td right>{fmtLitres(line.openingStock)}</Td>
      <Td right>{line.deliveredLitres > 0 ? fmtLitres(line.deliveredLitres) : <span className="text-slate-300">—</span>}</Td>
      <Td right>{fmtLitres(line.soldLitres)}</Td>
      <Td right>{fmtLitres(line.closingStock)}</Td>
      <Td right>{fmtMoney(line.sellingPrice)}<span className="text-slate-400 text-xs">/L</span></Td>
      <Td right>{fmtMoney(line.expectedRevenue)}</Td>
      {isOwnerOrAdmin && <Td right>{fmtMoney(line.costOfGoods)}</Td>}
      {isOwnerOrAdmin && <Td right><span className={`font-medium ${profitColor}`}>{fmtMoney(line.grossProfit)}</span></Td>}
      <Td right>
        {line.stockVariance === 0 ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span className={`font-medium ${line.stockVariance > 0 ? 'text-amber-600' : 'text-red-600'}`}>
            {line.stockVariance > 0 ? '+' : ''}{line.stockVariance.toFixed(1)} L
          </span>
        )}
      </Td>
      {isOwnerOrAdmin && <Td right>
        {line.dipLossAmount > 0
          ? <span className="text-red-600 font-medium">-{fmtMoney(line.dipLossAmount)}</span>
          : <span className="text-slate-300">—</span>}
      </Td>}
      <Td right>{line.creditSoldAmount > 0 ? fmtMoney(line.creditSoldAmount) : <span className="text-slate-300">—</span>}</Td>
    </tr>
  )
}

function ShiftLineRow({ line }: { line: BsShiftLine }) {
  const fleetCard = line.fleetCardCollected ?? 0
  return (
    <>
      {/* Shift summary row — shows operator, DU, and all payment totals */}
      <tr className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
        <Td>{line.operatorName}</Td>
        <Td>
          <span className="font-medium text-slate-700">DU #{line.duNumber}</span>
          {line.duName && <span className="text-xs text-slate-500 ml-1">· {line.duName}</span>}
        </Td>
        <Td><span className="text-xs text-slate-500 block max-w-[100px]">{line.fuelTypesSummary}</span></Td>
        <Td right>{fmtLitres(line.litresSold)}</Td>
        <Td right>{fmtMoney(line.expectedRevenue)}</Td>
        <Td right><span className="font-medium text-slate-800">{fmtMoney(line.cashCollected + line.upiCollected + line.cardCollected + fleetCard)}</span></Td>
        <Td right>{line.cashCollected > 0 ? fmtMoney(line.cashCollected) : <span className="text-slate-300">—</span>}</Td>
        <Td right>{line.upiCollected > 0 ? fmtMoney(line.upiCollected) : <span className="text-slate-300">—</span>}</Td>
        <Td right>{line.cardCollected > 0 ? fmtMoney(line.cardCollected) : <span className="text-slate-300">—</span>}</Td>
        <Td right>{fleetCard > 0 ? fmtMoney(fleetCard) : <span className="text-slate-300">—</span>}</Td>
        <Td right>{line.creditAmount > 0 ? fmtMoney(line.creditAmount) : <span className="text-slate-300">—</span>}</Td>
        <DiscrepancyTd value={line.discrepancy} />
      </tr>
      {/* Per-nozzle breakdown rows — one row per nozzle showing fuel type and litres only */}
      {(line.nozzleReadings ?? []).map((nr: NozzleReadingLine, i: number) => {
        const badge = FUEL_BADGE[nr.fuelType] ?? 'bg-slate-100 text-slate-600'
        return (
          <tr key={i} className="border-t border-slate-100 bg-slate-50/40">
            <Td></Td>
            <Td>
              <span className="text-xs text-slate-400 ml-3">↳ Nozzle #{nr.nozzleNumber}</span>
            </Td>
            <Td>
              <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${badge}`}>
                {nr.fuelType.replace('_', ' ')}
              </span>
            </Td>
            <Td right><span className="text-xs text-slate-500">{fmtLitres(nr.litresSold)}</span></Td>
            <Td right><span className="text-xs text-slate-500">{fmtMoney(nr.expectedRevenue)}</span></Td>
            <Td colSpan={7}></Td>
          </tr>
        )
      })}
    </>
  )
}

// ── Summary tile ────────────────────────────────────────────────────────────────

interface SummaryTileProps {
  label: string
  value: string
  sublabel?: string
  accent?: 'green' | 'red' | 'amber' | 'blue'
}

function SummaryTile({ label, value, sublabel, accent }: SummaryTileProps) {
  const accentMap = {
    green: 'text-emerald-600',
    red:   'text-red-600',
    amber: 'text-amber-600',
    blue:  'text-blue-600',
  }
  const valueColor = accent ? accentMap[accent] : 'text-slate-800'

  return (
    <div className="ui-card-plain bg-white px-4 py-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
      {sublabel && <p className={`text-xs mt-0.5 ${valueColor}`}>{sublabel}</p>}
    </div>
  )
}

// ── Ancillary product sales section (DAY reports only) ─────────────────────────

function ProductSalesSection({ productSales }: { productSales: ProductSalesSummary }) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Ancillary Product Sales
        <span className="ml-2 text-slate-400 normal-case font-normal">
          ({productSales.productLines.length} product{productSales.productLines.length !== 1 ? 's' : ''})
        </span>
      </h3>
      <div className="ui-card p-0 overflow-x-auto border-emerald-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-emerald-50 text-left">
              <Th>Product</Th>
              <Th right>Units Sold</Th>
              <Th right>Revenue</Th>
              {isOwnerOrAdmin && <Th right>COGS</Th>}
              {isOwnerOrAdmin && <Th right>Gross Profit</Th>}
            </tr>
          </thead>
          <tbody>
            {productSales.productLines.map(line => {
              const lineProfit = line.revenue - line.cogs
              const profitColor = lineProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
              return (
                <tr key={line.productId} className="border-t border-emerald-100 hover:bg-emerald-50 transition-colors">
                  <Td><span className="font-medium text-slate-700">{line.productName}</span></Td>
                  <Td right>{line.unitsSold}</Td>
                  <Td right>{fmtMoney(line.revenue)}</Td>
                  {isOwnerOrAdmin && <Td right>{fmtMoney(line.cogs)}</Td>}
                  {isOwnerOrAdmin && <Td right>
                    <span className={`font-medium ${profitColor}`}>{fmtMoney(lineProfit)}</span>
                  </Td>}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50 font-semibold border-t border-emerald-200">
              <Td>Total</Td>
              <Td right>—</Td>
              <Td right>{fmtMoney(productSales.totalRevenue)}</Td>
              {isOwnerOrAdmin && <Td right>{fmtMoney(productSales.totalCogs)}</Td>}
              {isOwnerOrAdmin && <Td right>
                <span className={productSales.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {fmtMoney(productSales.grossProfit)}
                </span>
              </Td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Approved expenses section (DAY reports only) ────────────────────────────────

function ExpensesSection({ expenses }: { expenses: ExpenseSummary }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Approved Expenses
        <span className="ml-2 text-slate-400 normal-case font-normal">
          ({expenses.lines.length} expense{expenses.lines.length !== 1 ? 's' : ''})
        </span>
      </h3>
      <div className="rounded-xl border border-red-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-red-50 text-left">
              <Th>Category</Th>
              <Th>Description</Th>
              <Th>Recorded By</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.lines.map(line => (
              <tr key={line.id} className="border-t border-red-100 hover:bg-red-50 transition-colors">
                <Td>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                    {line.category.replace(/_/g, ' ')}
                  </span>
                </Td>
                <Td><span className="text-xs text-slate-500">{line.description}</span></Td>
                <Td><span className="text-xs text-slate-500">{line.recordedByName}</span></Td>
                <Td right>
                  <span className="font-medium text-red-600">{fmtMoney(line.amount)}</span>
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-red-50 font-semibold border-t border-red-200">
              <Td colSpan={3}>Total Expenses</Td>
              <Td right>
                <span className="text-red-600">{fmtMoney(expenses.totalAmount)}</span>
              </Td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Payment settlement section (DAY reports only) ──────────────────────────────

function SettlementSection({ summary }: { summary: SettlementSummary }) {
  const TYPE_LABELS: Record<string, string> = { UPI: 'UPI', CARD: 'Card', FLEET_CARD: 'Fleet Card' }

  const rows = [
    { type: 'UPI',        settled: summary.upiSettledOnDate,        pending: summary.walletUpiPending },
    { type: 'CARD',       settled: summary.cardSettledOnDate,        pending: summary.walletCardPending },
    { type: 'FLEET_CARD', settled: summary.fleetCardSettledOnDate,   pending: summary.walletFleetCardPending },
  ]

  const totalSettled = rows.reduce((s, r) => s + r.settled, 0)
  const totalPending = rows.reduce((s, r) => s + r.pending, 0)

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
        Digital Payment Settlements
      </h3>
      <div className="border border-slate-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Payment Type</Th>
              <Th right>Settled on this Date</Th>
              <Th right>Cumulative Wallet Pending</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.type} className="border-t border-slate-100">
                <Td>{TYPE_LABELS[r.type]}</Td>
                <Td right>
                  {r.settled > 0
                    ? <span className="text-emerald-600 font-medium">{fmtMoney(r.settled)}</span>
                    : <span className="text-slate-400">—</span>
                  }
                </Td>
                <Td right>
                  {r.pending !== 0
                    ? <span className={r.pending > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>{fmtMoney(r.pending)}</span>
                    : <span className="inline-flex items-center gap-1 text-slate-400">Settled<Check size={11} strokeWidth={2.5} /></span>
                  }
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold border-t border-slate-200">
              <Td>Total</Td>
              <Td right>{totalSettled > 0 ? fmtMoney(totalSettled) : '—'}</Td>
              <Td right>
                <span className={totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  {fmtMoney(totalPending)}
                </span>
              </Td>
            </tr>
          </tfoot>
        </table>
        {summary.settlementsOnDate.length > 0 && (
          <div className="border-t border-slate-200 p-3 bg-slate-50">
            <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Recorded on this date</p>
            <div className="space-y-1">
              {summary.settlementsOnDate.map(s => (
                <div key={s.id} className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="font-medium">{TYPE_LABELS[s.paymentType]}</span>
                  <span className="text-emerald-700 font-mono font-semibold">{fmtMoney(s.amountReceived)}</span>
                  {s.notes && <span className="text-slate-400">· {s.notes}</span>}
                  <span className="text-slate-400 ml-auto">by {s.recordedByUserName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const { user } = useAuthStore()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canView   = canManage || user?.role === 'MANAGER'

  const { selectedPumpId } = usePumpStore()
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BalanceSheetSummary | null>(null)

  // Date range filter — defaults to last 7 days → today (computed fresh on mount, not at module load)
  const [filterFrom, setFilterFrom] = useState(() => localDateStr(-7))
  const [filterTo, setFilterTo]     = useState(() => localDateStr(0))

  const [bsPage, setBsPage]         = useState(0)
  const [bsPageSize, setBsPageSize] = useState(10)

  const pumpId = selectedPumpId

  const { data: pumps = [] } = useQuery({
    queryKey: ['my-pumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''

  // Reset to page 0 when filters change
  useEffect(() => { setBsPage(0) }, [filterFrom, filterTo, pumpId])

  // Report list
  const { data: reportsPage, isLoading, isFetching: fetchingReports, dataUpdatedAt: reportsUpdatedAt } = useQuery({
    queryKey: ['balance-sheets', pumpId, filterFrom, filterTo, bsPage, bsPageSize],
    queryFn:  () => balanceSheetApi.list(
      pumpId!,
      filterFrom || undefined,
      filterTo   || undefined,
      bsPage,
      bsPageSize,
    ),
    enabled: !!pumpId,
  })

  const reports = reportsPage?.content ?? []

  // Selected report summary (for delete modal)
  const selectedSummary = reports.find(r => r.id === selectedReportId) ?? null

  if (!canView) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You do not have permission to view balance sheets.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden print:h-auto print:overflow-visible">
      {/* ── Left panel: list ────────────────────────────────────────────────── */}
      <div className={`flex flex-col ${selectedReportId ? 'hidden md:flex w-80 flex-shrink-0' : 'flex-1'} border-r border-slate-200 bg-white overflow-hidden print:hidden`}>
        {/* Page header */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-800">Balance Sheets</h1>
              <RefreshIndicator isFetching={fetchingReports} dataUpdatedAt={reportsUpdatedAt ?? 0} />
            </div>
            <button
              onClick={() => setShowGenerateModal(true)}
              disabled={!pumpId}
              className="ui-btn ui-btn-primary gap-1.5 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              <span className="text-base leading-none">+</span>
              Generate
            </button>
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="flex-1 text-xs text-slate-700"
              placeholder="From"
            />
            <span className="text-slate-300 text-xs">to</span>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="flex-1 text-xs text-slate-700"
              placeholder="To"
            />
            {(filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterFrom(''); setFilterTo(''); setBsPage(0) }}
                className="ui-btn ui-btn-ghost min-h-0 p-1 text-slate-400 hover:text-slate-600"
                title="Clear filter"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Report list */}
        <div className="flex-1 overflow-y-auto">
          {(!pumpId || isLoading) && (
            <div className="px-4 py-4"><SkeletonRows count={5} /></div>
          )}

          {!isLoading && pumpId && reports.length === 0 && (
            <EmptyState
              icon="generic"
              title="No balance sheets found"
              subtitle="Generate a report after closing all shifts for a period."
            />
          )}

          {reports.map(report => (
            <ReportListItem
              key={report.id}
              report={report}
              isSelected={selectedReportId === report.id}
              onClick={() => setSelectedReportId(selectedReportId === report.id ? null : report.id)}
            />
          ))}

          {reportsPage && (
            <div className="px-3 border-t border-slate-100">
              <Pagination
                data={reportsPage}
                onPageChange={p => setBsPage(p)}
                onPageSizeChange={s => { setBsPageSize(s); setBsPage(0) }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: detail ──────────────────────────────────────────────── */}
      {selectedReportId && selectedSummary && (
        <DetailPanel
          pumpId={pumpId!}
          reportId={selectedReportId}
          summary={selectedSummary}
          onClose={() => setSelectedReportId(null)}
          canDelete={canManage}
          onDelete={(s) => { setDeleteTarget(s); setSelectedReportId(null) }}
          pumpName={pumpName}
        />
      )}

      {/* Empty detail state */}
      {!selectedReportId && (
        <div className="flex-1 hidden sm:flex items-center justify-center bg-slate-50/70">
          <div className="ui-empty">
            <div className="flex justify-center mb-3"><BarChart2 size={40} strokeWidth={1.5} className="text-slate-300" /></div>
            <p className="ui-subtitle">Select a report to view details</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showGenerateModal && pumpId && (
        <GenerateModal pumpId={pumpId} onClose={() => setShowGenerateModal(false)} />
      )}

      {deleteTarget && pumpId && (
        <DeleteConfirmModal
          report={deleteTarget}
          pumpId={pumpId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Report list item ────────────────────────────────────────────────────────────

interface ReportListItemProps {
  report: BalanceSheetSummary
  isSelected: boolean
  onClick: () => void
}

function ReportListItem({ report, isSelected, onClick }: ReportListItemProps) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isDay = report.reportType === 'DAY'
  const discrepancyColor = report.cashDiscrepancy === 0
    ? 'text-emerald-600'
    : report.cashDiscrepancy < 0
      ? 'text-red-500'
      : 'text-amber-500'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors ${
        isSelected ? 'bg-blue-50/80 border-l-2 border-l-blue-500 shadow-[inset_0_0_0_1px_rgba(191,219,254,0.7)]' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
              isDay ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isDay ? 'Day' : 'Shift'}
            </span>
            <span className="text-sm font-medium text-slate-700 truncate">{report.periodLabel}</span>
          </div>
          <p className="text-xs text-slate-500">{fmtDate(report.reportDate)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {report.shiftCount} shift{report.shiftCount !== 1 ? 's' : ''} · {fmtLitres(report.totalLitresSold)} sold
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-slate-700">{fmtMoney(report.totalExpectedRevenue)}</p>
          <p className={`text-xs font-medium ${discrepancyColor}`}>
            {report.cashDiscrepancy === 0
              ? 'Balanced'
              : <span className="inline-flex items-center gap-0.5">{report.cashDiscrepancy < 0 ? <TrendingDown size={12} strokeWidth={2} /> : <TrendingUp size={12} strokeWidth={2} />}{fmtMoney(Math.abs(report.cashDiscrepancy))}</span>}
          </p>
          {isOwnerOrAdmin && <p className="text-xs text-emerald-600">{fmtMoney(report.totalGrossProfit)} profit</p>}
        </div>
      </div>
    </button>
  )
}
