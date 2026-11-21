import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import type { GenerateBalanceSheetRequest } from '../../api/balanceSheetApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'

// ── Generate Modal ──────────────────────────────────────────────────────────────

interface GenerateModalProps {
  pumpId: number
  onClose: () => void
}

export function GenerateModal({ pumpId, onClose }: GenerateModalProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const [reportType, setReportType] = useState<'SHIFT' | 'DAY'>('SHIFT')
  const [reportDate, setReportDate] = useState(() => localDateInputValue(0))
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

  const selectedShiftDefinitionId = reportType === 'SHIFT'
    ? (shiftDefinitionId ?? shiftDefinitions[0]?.id ?? null)
    : null

  const mutation = useMutation({
    mutationFn: (req: GenerateBalanceSheetRequest) => balanceSheetApi.generate(pumpId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast('Balance sheet generated successfully', 'success')
      onClose()
    },
    onError: (err) => {
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
    if (selectedShiftDefinitionId !== null) {
      req.shiftDefinitionId = selectedShiftDefinitionId
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
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel">
        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Generate Balance Sheet</h2>
            <p className="ui-modal-subtitle">Create a shift or day-end financial snapshot for this pump.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        {/* Body */}
        <div className="ui-modal-body space-y-4">
          {/* Report type toggle */}
          <div>
            <span className="ui-label">Report Type</span>
            <div role="group" aria-label="Report Type" className="ui-card-plain flex gap-1 p-1">
              {(['SHIFT', 'DAY'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setReportType(t); if (t === 'DAY') setShiftDefinitionId(null) }}
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
            <p className="mt-1.5 text-xs text-slate-500">
              {reportType === 'SHIFT'
                ? 'Covers one shift. All shifts in that window must be closed first.'
                : 'Covers the full business day. All shifts should be closed before generating.'}
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="block">
              <span className="ui-label">Business Date</span>
              <input
                type="date"
                value={reportDate}
                onChange={e => setReportDate(e.target.value)}
                className="shadow-sm"
              />
            </label>
          </div>

          {/* Shift (only for SHIFT reports) */}
          {reportType === 'SHIFT' && (
            <div>
              <span className="ui-label">Shift</span>
              {defsLoading ? (
                <p className="ui-help">Loading shifts…</p>
              ) : shiftDefinitions.length === 0 ? (
                <p className="text-xs text-red-500">No shift definitions configured for this pump. Please set them up in pump settings first.</p>
              ) : (
                <SearchableSelect label="Shift"
                  value={selectedShiftDefinitionId !== null ? String(selectedShiftDefinitionId) : ''}
                  onChange={v => setShiftDefinitionId(Number(v))}
                  options={shiftDefinitions.map(d => ({ value: String(d.id), label: `${d.name} · ${d.windowLabel}` }))}
                />
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block">
              <span className="ui-label">Notes <span className="text-slate-500">(optional)</span></span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Any remarks for this report…"
                className="resize-none shadow-sm"
              />
            </label>
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
            <div role="alert" className="ui-alert ui-alert-danger text-sm">
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
