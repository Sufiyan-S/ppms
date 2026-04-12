import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { calibrationApi } from '../../api/calibrationApi'
import type { LogCalibrationRequest, NozzleCalibrationLog } from '../../api/calibrationApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, formatIstDateTime, localDateInputValue } from '../../utils/date'

function fmtDate(d: string) {
  return formatIstDate(d)
}

function fmtDateTime(d: string) {
  return formatIstDateTime(d, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CalibrationPage() {
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: dus = [] } = useQuery({
    queryKey:  ['dus', pumpId],
    queryFn:   () => pumpApi.getDUs(pumpId!),
    enabled:   !!pumpId,
  })
  const nozzles = dus.flatMap((d) => d.nozzles)

  const [selectedNozzleId, setSelectedNozzleId] = useState<number>(0)

  // History filter — independent from the form nozzle selector
  const [historyNozzleId, setHistoryNozzleId] = useState<number>(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { data: calibrationsPage, isLoading } = useQuery({
    queryKey:  ['calibrations', pumpId, historyNozzleId, historyPage, historyPageSize],
    queryFn:   () => historyNozzleId
      ? calibrationApi.getCalibrations(pumpId!, historyNozzleId, historyPage, historyPageSize)
      : calibrationApi.getPumpCalibrations(pumpId!, historyPage, historyPageSize),
    enabled:   !!pumpId,
  })

  const [form, setForm] = useState<LogCalibrationRequest>({
    calibrationDate: localDateInputValue(),
    nextCalibrationDue: null,
    calibratedBy: null,
    certificateReference: null,
    notes: null,
  })
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: LogCalibrationRequest) =>
      calibrationApi.recordCalibration(pumpId!, selectedNozzleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calibrations', pumpId] })
      setHistoryNozzleId(selectedNozzleId)
      setHistoryPage(0)
      setForm({ calibrationDate: localDateInputValue(), nextCalibrationDue: null, calibratedBy: null, certificateReference: null, notes: null })
      setFormError(null)
      setReviewOpen(false)
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Failed to record calibration'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedNozzleId) { setFormError('Please select a nozzle'); return }
    if (!form.calibratedBy?.trim()) { setFormError('Calibrated By is required'); return }
    if (!form.calibrationDate) { setFormError('Calibration date is required'); return }
    setFormError(null)
    setReviewOpen(true)
  }

  const selectedNozzle = nozzles.find((n) => n.id === selectedNozzleId)
  const historyNozzle  = nozzles.find((n) => n.id === historyNozzleId)
  const calibrations   = calibrationsPage?.content ?? []
  const nozzleMap = useMemo(
    () => new Map(nozzles.map((n) => [n.id, n])),
    [nozzles],
  )

  const submitCalibration = () => {
    if (!selectedNozzleId) {
      setFormError('Please select a nozzle')
      return
    }
    if (!form.calibratedBy?.trim()) {
      setFormError('Calibrated By is required')
      return
    }
    createMutation.mutate({
      ...form,
      calibratedBy: form.calibratedBy.trim(),
      certificateReference: form.certificateReference?.trim() || null,
      notes: form.notes?.trim() || null,
    })
  }

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Compliance</p>
          <h1 className="ui-title-sm">Nozzle Calibration</h1>
          <p className="ui-subtitle">Record periodic calibration checks for regulatory compliance</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Nozzles</span>
            <span className="ui-section-meta-value">{nozzles.length}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">History</span>
            <span className="ui-section-meta-value">{calibrationsPage?.totalElements ?? calibrations.length}</span>
          </div>
        </div>
      </div>

      {/* ── Record form ── */}
      <form onSubmit={handleSubmit} className="ui-card ui-form-shell">
        <div className="ui-form-shell__head">
          <div>
            <p className="ui-section-kicker mb-2">Calibration Entry</p>
            <h2 className="ui-title-sm">Record calibration</h2>
            <p className="ui-subtitle mt-1">Attach the calibration date, technician, and next due date for compliance history.</p>
          </div>
        </div>

        <div className="ui-form-shell__grid">
          <div>
            <label className="ui-label">Nozzle</label>
            <SearchableSelect
              value={selectedNozzleId ? selectedNozzleId.toString() : ''}
              onChange={v => { setSelectedNozzleId(parseInt(v) || 0); setFormError(null) }}
              placeholder="Select nozzle…"
              options={nozzles.map((n) => ({
                value: n.id.toString(),
                label: `Nozzle #${n.nozzleNumber} — ${n.fuelType}`,
              }))}
            />
          </div>

          <div>
            <label className="ui-label">Calibration Date</label>
            <input
              type="date"
              value={form.calibrationDate}
              onChange={e => setForm(f => ({ ...f, calibrationDate: e.target.value }))}
              className="text-sm"
              required
            />
          </div>

          <div>
            <label className="ui-label">Next Calibration Due (optional)</label>
            <input
              type="date"
              value={form.nextCalibrationDue ?? ''}
              onChange={e => setForm(f => ({ ...f, nextCalibrationDue: e.target.value || null }))}
              className="text-sm"
            />
          </div>

          <div>
            <label className="ui-label">Calibrated By *</label>
            <input
              type="text"
              value={form.calibratedBy ?? ''}
              onChange={e => setForm(f => ({ ...f, calibratedBy: e.target.value || null }))}
              className="text-sm"
              placeholder="Technician or agency name"
            />
          </div>

          <div>
            <label className="ui-label">Certificate Reference (optional)</label>
            <input
              type="text"
              value={form.certificateReference ?? ''}
              onChange={e => setForm(f => ({ ...f, certificateReference: e.target.value || null }))}
              className="text-sm"
              placeholder="Inspection certificate number"
            />
          </div>

          <div>
            <label className="ui-label">Notes (optional)</label>
            <input
              type="text"
              value={form.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
              className="text-sm"
              placeholder="Additional observations"
            />
          </div>
        </div>

        {formError && <p className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {createMutation.isPending ? 'Saving…' : 'Review Calibration'}
        </button>
      </form>

      {reviewOpen && (
        <div className="ui-modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div className="ui-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Review Calibration</h2>
                <p className="ui-modal-subtitle">Verify the nozzle and calibration details before saving.</p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
            </div>
            <div className="ui-modal-body space-y-4">
              {formError && <div className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>}
              <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
                <CalibrationReviewRow
                  label="Nozzle"
                  value={selectedNozzle
                    ? `Nozzle #${selectedNozzle.nozzleNumber} — ${selectedNozzle.fuelType}`
                    : '—'}
                />
                <CalibrationReviewRow label="Calibration Date" value={fmtDate(form.calibrationDate)} />
                <CalibrationReviewRow label="Next Calibration Due" value={form.nextCalibrationDue ? fmtDate(form.nextCalibrationDue) : '—'} />
                <CalibrationReviewRow label="Calibrated By" value={form.calibratedBy?.trim() || '—'} />
                <CalibrationReviewRow label="Certificate Reference" value={form.certificateReference?.trim() || '—'} />
                <CalibrationReviewRow label="Notes" value={form.notes?.trim() || '—'} />
              </div>
            </div>
            <div className="ui-modal-footer">
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-secondary">
                Back
              </button>
              <button
                onClick={submitCalibration}
                disabled={createMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {createMutation.isPending ? 'Saving…' : 'Confirm Calibration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Calibration history ── */}
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">
            Calibration History
            {historyNozzleId === 0 ? (
              <span className="text-slate-400 font-normal ml-1">— All nozzles</span>
            ) : historyNozzle ? (
              <span className="text-slate-400 font-normal ml-1">
                — Nozzle #{historyNozzle.nozzleNumber} ({historyNozzle.fuelType})
              </span>
            ) : null}
          </p>

          <div className="ui-toolbar-actions">
            <div className="w-56">
            <SearchableSelect
              value={historyNozzleId ? historyNozzleId.toString() : ''}
              onChange={v => { setHistoryNozzleId(parseInt(v) || 0); setHistoryPage(0) }}
              placeholder="Filter by nozzle…"
              options={[
                { value: '', label: 'All nozzles' },
                ...nozzles.map((n) => ({
                  value: n.id.toString(),
                  label: `Nozzle #${n.nozzleNumber} — ${n.fuelType}`,
                })),
              ]}
              size="sm"
            />
          </div>
          </div>
        </div>

        {isLoading ? (
          <p className="ui-empty px-5 py-6">Loading…</p>
        ) : calibrations.length === 0 ? (
          <p className="ui-empty px-5 py-6">
            {historyNozzleId ? 'No calibration records for this nozzle yet.' : 'No calibration records found yet.'}
          </p>
        ) : (
          <>
            <div className="ui-record-list">
              {calibrations.map((c: NozzleCalibrationLog) => {
                const nozzle = nozzleMap.get(c.nozzleId)
                return (
                <div key={c.id} className="ui-record-row">
                  <div className="ui-record-row__main">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{fmtDate(c.calibrationDate)}</p>
                      <div className="ui-record-row__meta mt-0">
                        Nozzle #{nozzle?.nozzleNumber ?? c.nozzleId}
                        {nozzle?.fuelType ? ` · ${nozzle.fuelType}` : ''}
                      </div>
                    </div>
                    {c.nextCalibrationDue && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Next due: {fmtDate(c.nextCalibrationDue)}
                      </span>
                    )}
                  </div>
                  <div className="ui-record-row__meta">
                    {c.calibratedBy && <span>By: {c.calibratedBy}</span>}
                    {c.certificateReference && <span>Cert: {c.certificateReference}</span>}
                    <span className="text-slate-400">Logged by: {c.loggedByName}</span>
                    <span className="text-slate-400">Logged at: {fmtDateTime(c.createdAt)}</span>
                  </div>
                  {c.notes && <p className="text-xs text-slate-400">{c.notes}</p>}
                  </div>
                </div>
              )})}
            </div>
            {calibrationsPage && (
              <div className="px-5">
                <Pagination
                  data={calibrationsPage}
                  onPageChange={p => setHistoryPage(p)}
                  onPageSizeChange={s => { setHistoryPageSize(s); setHistoryPage(0) }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CalibrationReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="font-medium text-sm text-slate-800 text-right">{value}</span>
    </div>
  )
}
