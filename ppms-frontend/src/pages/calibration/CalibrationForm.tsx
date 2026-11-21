import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { calibrationApi } from '../../api/calibrationApi'
import type { LogCalibrationRequest } from '../../api/calibrationApi'
import type { NozzleDetail } from '../../types/shift'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { Reveal } from '../../components/Reveal'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { CalibrationReviewRow } from './CalibrationReviewRow'
import { fmtDate } from './calibrationFormat'

interface CalibrationFormProps {
  pumpId: number | null
  nozzles: NozzleDetail[]
  onRecorded: (nozzleId: number) => void
}

export function CalibrationForm({ pumpId, nozzles, onRecorded }: CalibrationFormProps) {
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const [selectedNozzleId, setSelectedNozzleId] = useState<number>(0)
  const [reviewOpen, setReviewOpen] = useState(false)
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
      onRecorded(selectedNozzleId)
      setForm({ calibrationDate: localDateInputValue(), nextCalibrationDue: null, calibratedBy: null, certificateReference: null, notes: null })
      setFormError(null)
      setReviewOpen(false)
      addToast('Calibration recorded successfully', 'success')
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to record calibration')
      setFormError(msg)
      addToast(msg, 'error')
    },
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
    <>
      {/* ── Record form ── */}
      <Reveal delay={130}>
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
            <span className="ui-label">Nozzle</span>
            <SearchableSelect label="Nozzle"
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
            <label className="block">
              <span className="ui-label">Calibration Date</span>
              <input
                type="date"
                value={form.calibrationDate}
                onChange={e => setForm(f => ({ ...f, calibrationDate: e.target.value }))}
                className="text-sm"
                required
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Next Calibration Due (optional)</span>
              <input
                type="date"
                value={form.nextCalibrationDue ?? ''}
                onChange={e => setForm(f => ({ ...f, nextCalibrationDue: e.target.value || null }))}
                className="text-sm"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Calibrated By *</span>
              <input
                type="text"
                value={form.calibratedBy ?? ''}
                onChange={e => setForm(f => ({ ...f, calibratedBy: e.target.value || null }))}
                className="text-sm"
                placeholder="Technician or agency name"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Certificate Reference (optional)</span>
              <input
                type="text"
                value={form.certificateReference ?? ''}
                onChange={e => setForm(f => ({ ...f, certificateReference: e.target.value || null }))}
                className="text-sm"
                placeholder="Inspection certificate number"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Notes (optional)</span>
              <input
                type="text"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                className="text-sm"
                placeholder="Additional observations"
              />
            </label>
          </div>
        </div>

        {formError && <p role="alert" className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {createMutation.isPending
          ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Saving…</span>
          : 'Review Calibration'}
        </button>
      </form>
      </Reveal>

      {reviewOpen && (
        <ModalPortal onClose={() => setReviewOpen(false)} closeOnBackdropClick>
        <div className="ui-modal-backdrop">
          <div className="ui-modal-panel w-full max-w-md">
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Review Calibration</h2>
                <p className="ui-modal-subtitle">Verify the nozzle and calibration details before saving.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
            </div>
            <div className="ui-modal-body space-y-4">
              {formError && <div role="alert" className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>}
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
        </ModalPortal>
      )}
    </>
  )
}
