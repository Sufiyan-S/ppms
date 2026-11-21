import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { shiftApi } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { parseApiError } from '../../../utils/apiError'
import type { CreditEntry } from '../../../types/shift'
import { fmt } from '../components/creditRow'
import { focusOnMount } from '../../../utils/focus'
import { FUEL_LABELS } from '../../../constants/fuel'

interface Props {
  shift: Shift
  entries: CreditEntry[]
  total: number
  onEdit: (entry: CreditEntry) => void
  onVoided: (entryId: number) => void
}

export function PreRecordedCreditList({ shift, entries, total, onEdit, onVoided }: Props) {
  const queryClient = useQueryClient()
  const [voidingEntryId,    setVoidingEntryId]   = useState<number | null>(null)
  const [voidReasonInput,   setVoidReasonInput]  = useState('')
  const [voidError,         setVoidError]        = useState<string | null>(null)

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: (_, { entryId }) => {
      onVoided(entryId)
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

  // Price lookup per fuel type (for liters display)
  const priceFor = (ft: string | null) =>
    ft ? (shift.fuelReadings.find(r => r.fuelType === ft)?.priceSnapshot ?? null) : null

  return (
    <div className="px-4 py-2.5 bg-orange-50/70 border-b border-orange-100">
      <p className="text-xs font-semibold text-orange-700 mb-2">
        Pre-recorded during shift ({entries.length})
      </p>
      <div className="space-y-2">
        {entries.map((e) => {
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
                      <span className="text-xs text-slate-500 uppercase tracking-wide">{FUEL_LABELS[e.fuelType] ?? e.fuelType}</span>
                    )}
                    {e.billNo && (
                      <span className="text-xs text-slate-500">#{e.billNo}</span>
                    )}
                  </div>
                  {liters && price ? (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {liters.toFixed(2)} {unit} × ₹{price} =&nbsp;
                      <span className="font-semibold text-emerald-700">₹{fmt(e.amount)}</span>
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700 mt-0.5">₹{fmt(e.amount)}</p>
                  )}
                  {e.description && (
                    <p className="text-xs text-slate-500 italic mt-0.5">{e.description}</p>
                  )}
                </div>
                {!isVoiding && (
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
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
                  <input aria-label="Reason for deleting"
                    ref={focusOnMount}
                    type="text"
                    value={voidReasonInput}
                    onChange={e => setVoidReasonInput(e.target.value)}
                    onKeyDown={event => {
                      if (event.key !== 'Escape') return
                      event.preventDefault()
                      setVoidingEntryId(null); setVoidReasonInput(''); setVoidError(null)
                    }}
                    placeholder="Reason for deleting (required)"
                    className="ui-input-compact text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                  {voidError && <p role="alert" className="ui-error-text">{voidError}</p>}
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
        <span className="text-xs font-bold text-orange-700">₹{fmt(total)}</span>
      </div>
    </div>
  )
}
