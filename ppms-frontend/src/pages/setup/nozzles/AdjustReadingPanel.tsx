import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { dipApi } from '../../../api/dipApi'
import type { NozzleDetail } from '../../../types/shift'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { FUEL_UNIT } from '../../../constants/fuel'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  nozzle: NozzleDetail
  onClose: () => void
}

export function AdjustReadingPanel({ pumpId, nozzle, onClose }: Props) {
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const [adjustType, setAdjustType] = useState<'RESET' | 'CUSTOM_READING'>('CUSTOM_READING')
  const [adjustReading, setAdjustReading] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const recordAdjustmentMutation = useMutation({
    mutationFn: ({ nozzleId, adjustmentType, reason, newReading }: { nozzleId: number; adjustmentType: 'RESET' | 'CUSTOM_READING'; reason: string; newReading?: number }) =>
      dipApi.recordAdjustment(pumpId, nozzleId, adjustmentType, reason, newReading),
    onSuccess: () => { onClose(); addToast('Reading adjusted', 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, 'Failed to record adjustment'); setAdjustError(msg); addToast(msg, 'error') },
  })

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault(); setAdjustError(null)
    if (!adjustReason.trim()) { setAdjustError('Please provide a reason.'); return }
    if (adjustType === 'CUSTOM_READING') {
      if (!adjustReading) { setAdjustError('Enter a new reading.'); return }
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'CUSTOM_READING',
        reason: adjustReason,
        newReading: Number(adjustReading),
      })
    } else {
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'RESET',
        reason: adjustReason,
      })
    }
  }

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <form onSubmit={submitAdjustment} className="ui-reading-editor">
        <div className="ui-reading-editor__hero">
          <div>
            <p className="ui-section-kicker mb-2">Meter Adjustment</p>
            <h3 className="ui-title-sm">Adjust meter reading</h3>
            <p className="ui-subtitle mt-1">
              Use this only when the meter was replaced, reset, or the stored reading is incorrect for nozzle #{nozzle.nozzleNumber}.
            </p>
          </div>
        </div>
        <div className="ui-alert ui-alert-warning text-xs">
          Cannot be done while an active shift is running on this nozzle.
        </div>
        <div className="ui-reading-editor__section">
          <div className="ui-reading-editor__section-head">
            <div>
              <p className="ui-label mb-1">Adjustment type</p>
              <p className="ui-help mt-0">Choose whether to set an exact reading or reset this nozzle's meter to zero.</p>
            </div>
          </div>
          <div className="ui-reading-editor__mode-grid">
            <button
              type="button"
              onClick={() => setAdjustType('CUSTOM_READING')}
              className={`ui-reading-editor__mode-card ${adjustType === 'CUSTOM_READING' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--custom' : ''}`}
            >
              <span className="ui-reading-editor__mode-title">Set custom reading</span>
              <span className="ui-reading-editor__mode-copy">Enter a replacement reading for this nozzle.</span>
            </button>
            <button
              type="button"
              onClick={() => setAdjustType('RESET')}
              className={`ui-reading-editor__mode-card ${adjustType === 'RESET' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--danger' : ''}`}
            >
              <span className="ui-reading-editor__mode-title">Reset to zero</span>
              <span className="ui-reading-editor__mode-copy">Apply a full zero reset to this nozzle's meter.</span>
            </button>
          </div>
        </div>
        {adjustType === 'CUSTOM_READING' && (
          <div className="ui-reading-editor__section">
            <label className="block">
              <span className="ui-label">
              New reading <span className="ui-help mt-0">Current: {nozzle.lastReading} {FUEL_UNIT[nozzle.fuelType]}</span>
            </span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={adjustReading}
                onChange={(e) => setAdjustReading(e.target.value)}
                placeholder="New reading"
                className="text-sm"
              />
            </label>
          </div>
        )}
        {adjustType === 'RESET' && (
          <div className="ui-reading-editor__section">
            <div className="ui-alert ui-alert-danger">
              <p className="text-xs text-red-700">
                This will reset the meter on nozzle #{nozzle.nozzleNumber} to <strong>0.00</strong>. This action is logged and cannot be undone.
              </p>
            </div>
          </div>
        )}
        <div className="ui-reading-editor__section">
          <label className="block">
            <span className="ui-label">Reason <span className="text-red-500">*</span></span>
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Meter replaced after malfunction"
              className="text-sm"
            />
          </label>
          <p className="ui-help">This note is stored with the adjustment log for audit history.</p>
        </div>
        {adjustError && <p role="alert" className="ui-error-text">{adjustError}</p>}
        <div className="ui-reading-editor__actions">
          <button
            type="submit"
            disabled={recordAdjustmentMutation.isPending}
            className={`ui-btn ${adjustType === 'RESET' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
          >
            {recordAdjustmentMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" />Saving…</span> : adjustType === 'RESET' ? 'Reset to Zero' : 'Save Reading'}
          </button>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
        </div>
      </form>    </div>
  )
}
