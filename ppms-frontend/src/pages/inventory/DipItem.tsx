import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../api/inventoryApi'
import type { DipCheck } from '../../api/inventoryApi'
import { FUEL_COLORS, fmtQty } from './inventoryFormat'

// ── DIP item (compact card inside date group) ──────────────────────────────────

export function DipItem({ check, pumpId, canReview }: {
  check: DipCheck
  pumpId: number
  canReview: boolean
}) {
  const qc = useQueryClient()
  const cols = FUEL_COLORS[check.fuelType] ?? FUEL_COLORS.PETROL
  const over = check.variance > 0

  const reviewMutation = useMutation({
    mutationFn: () => inventoryApi.reviewDipCheck(pumpId, check.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipChecks', pumpId] }),
  })

  const statusBadge = () => {
    if (check.status === 'WITHIN_TOLERANCE') return null
    if (check.status === 'PENDING_REVIEW') {
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
          Needs Review
        </span>
      )
    }
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
        Reviewed{check.reviewedByUserName ? ` · ${check.reviewedByUserName}` : ''}
      </span>
    )
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 ${
      check.status === 'PENDING_REVIEW' ? 'bg-red-50 border border-red-100' : 'bg-slate-50'
    }`}>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cols.badge}`}>
        {check.fuelType}
      </span>
      <span className="text-xs font-semibold text-slate-700 w-14 shrink-0">{check.tankIdentifier}</span>
      <span className="text-xs text-slate-500 shrink-0">
        Measured: <span className="font-medium text-slate-700">{fmtQty(check.measuredQuantity)}</span>
      </span>
      <span className="text-xs text-slate-500 shrink-0">System: {fmtQty(check.systemStock)}</span>
      <span className="shrink-0">
        {check.variance === 0 ? (
          <span className="text-xs text-emerald-600 font-medium">Balanced</span>
        ) : (
          <span className={`text-xs font-semibold ${over ? 'text-amber-600' : 'text-red-600'}`}>
            {over ? '+' : ''}{check.variance.toFixed(1)} L
          </span>
        )}
      </span>
      {statusBadge()}
      {check.status === 'PENDING_REVIEW' && canReview && (
        <button
          onClick={() => reviewMutation.mutate()}
          disabled={reviewMutation.isPending}
          className="ui-btn ui-btn-danger min-h-0 px-2.5 py-0.5 text-xs rounded-full disabled:opacity-50 shrink-0"
        >
          {reviewMutation.isPending ? '…' : 'Acknowledge'}
        </button>
      )}
      {check.notes && (
        <span className="text-xs text-slate-500 italic shrink-0">{check.notes}</span>
      )}
      <span className="ml-auto text-xs text-slate-500 shrink-0">{check.loggedByUserName}</span>
    </div>
  )
}
