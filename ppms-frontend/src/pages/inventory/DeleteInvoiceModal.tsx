import { X } from 'lucide-react'
import type { TankerDelivery } from '../../api/inventoryApi'
import { ModalPortal } from '../../components/ModalPortal'
import { FUEL_COLORS, fmtDate } from './inventoryFormat'

// ── Delete invoice confirmation modal ─────────────────────────────────────────

export function DeleteInvoiceModal({ invoice, rows, isPending, error, onConfirm, onClose }: {
  invoice: string
  rows: TankerDelivery[]
  isPending: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const totalQty = rows.reduce((s, r) => s + r.quantityDelivered, 0)
  return (
    <ModalPortal onClose={onClose}>
      <div className="ui-modal-backdrop">
        <div className="ui-modal w-full max-w-md">
          <div className="ui-modal-header">
            <h2 className="ui-modal-title">Delete Invoice?</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="ui-modal-close"><X size={16} /></button>
          </div>

          <div className="ui-modal-body space-y-4">
            <p className="text-sm text-slate-600">
              This will permanently remove the invoice and reverse the fuel added to the tank(s).
              This action cannot be undone.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Bill No.</span>
                <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                  {invoice}
                </span>
                <span className="text-xs text-slate-500 ml-auto">{fmtDate(rows[0].deliveryDate)}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="font-medium text-slate-700">{r.tankIdentifier}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${(FUEL_COLORS[r.fuelType] ?? FUEL_COLORS.PETROL).badge}`}>
                      {r.fuelType}
                    </span>
                    <span className="text-slate-600 tabular-nums">
                      -{r.quantityDelivered.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-xs font-semibold text-slate-700">
                <span>Total removed</span>
                <span>{totalQty.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L</span>
              </div>
            </div>

            {error && <p role="alert" className="ui-error-text">{error}</p>}
          </div>

          <div className="ui-modal-footer justify-end gap-2">
            <button onClick={onClose} disabled={isPending} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="ui-btn bg-red-600 hover:bg-red-700 text-white border-red-600"
            >
              {isPending ? 'Deleting…' : 'Delete Invoice'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
