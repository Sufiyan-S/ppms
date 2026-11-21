import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '../../../api/shiftApi'
import type { ResolveDiscrepancyRequest } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { parseApiError } from '../../../utils/apiError'
import { ModalPortal } from '../../../components/ModalPortal'
import { RESOLUTION_OPTIONS } from '../shiftLabels'
import { IconButton } from '../../../components/IconButton'

export function ResolveDiscrepancyModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const qc = useQueryClient()
  const [action, setAction] = useState<ResolveDiscrepancyRequest['resolutionAction']>('PENDING_INVESTIGATION')
  const [note,   setNote]   = useState('')
  const [error,  setError]  = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: ResolveDiscrepancyRequest) => shiftApi.resolveDiscrepancy(shift.pumpId, shift.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to resolve discrepancy. Please try again.')),
  })

  const handleSubmit = () => {
    if (action === 'WAIVED' && !note.trim()) {
      setError('A written reason is required when waiving a discrepancy.')
      return
    }
    setError(null)
    mutation.mutate({ resolutionAction: action, resolutionNote: note.trim() || undefined })
  }

  const discType  = shift.discrepancyType
  const discAmt   = shift.discrepancyAmount

  return (
    <tr>
      <td colSpan={8} className="p-0">
        <ModalPortal onClose={onClose} closeOnBackdropClick>
        <div className="ui-modal-backdrop">
          <div className="ui-modal-panel w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--danger">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Resolve Discrepancy</h2>
                <p className="ui-modal-subtitle">
                  Shift #{shift.id} · {discType} ₹{discAmt?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
            </div>

            <div className="ui-modal-body space-y-4">
              <div>
                <span className="ui-label">Resolution Action</span>
                <SearchableSelect label="Resolution Action"
                  value={action}
                  onChange={(v) => setAction(v as ResolveDiscrepancyRequest['resolutionAction'])}
                  options={RESOLUTION_OPTIONS}
                />
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">
                  Note {action === 'WAIVED' && <span className="text-red-500">* required</span>}
                </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Enter justification or notes…"
                    className="resize-none text-sm"
                  />
                </label>
              </div>
              {error && <p role="alert" className="ui-error-text">{error}</p>}
              <div className="ui-modal-footer -mx-6 -mb-6">
                <button onClick={onClose} className="ui-btn ui-btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  className="ui-btn ui-btn-danger flex-1 disabled:bg-red-300"
                >
                  {mutation.isPending ? 'Saving…' : 'Confirm Resolution'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      </td>
    </tr>
  )
}
