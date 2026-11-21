import { ModalPortal } from '../../../components/ModalPortal'
import { FUEL_COLORS, fmtDate } from '../inventoryFormat'
import type { PreparedDeliveryItem } from './deliveryRows'
import { IconButton } from '../../../components/IconButton'

interface Props {
  items: PreparedDeliveryItem[]
  date: string
  invoice: string
  error: string | null
  isOwnerOrAdmin: boolean
  canSetBillTotal: boolean
  billTotalManual: boolean
  billTotalNum: number
  otherCharges: number
  isPending: boolean
  onBack: () => void
  onConfirm: () => void
}

export function DeliveryReviewDialog({
  items, date, invoice, error, isOwnerOrAdmin, canSetBillTotal, billTotalManual, billTotalNum, otherCharges,
  isPending, onBack, onConfirm,
}: Props) {
  return (
    <ModalPortal onClose={onBack} closeOnBackdropClick>
    <div className="ui-modal-backdrop">
      <div
        className="ui-modal-panel ui-modal-panel--lg"
      >
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">Review Tanker Delivery</h3>
            <p className="ui-modal-subtitle">Please verify the bill and tank-wise received fuel before submitting.</p>
          </div>
          <IconButton label="Close" icon="×" onClick={onBack} className="ui-btn ui-btn-ghost ui-modal-close" />
        </div>

        <div className="ui-modal-body space-y-5 max-h-[75vh]">
          {error && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">
              {error} Go back to modify the data and try again.
            </div>
          )}
          <div className={`grid gap-3 ${(canSetBillTotal && billTotalNum > 0) || isOwnerOrAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500">Delivery Date</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{fmtDate(date)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium text-slate-500">Invoice / Bill No.</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{invoice.trim()}</p>
            </div>
            {(canSetBillTotal && billTotalNum > 0) && (() => {
              const calcTotal = items.reduce((sum, item) => sum + item.totalCost, 0)
              const displayTotal = billTotalNum > 0 ? billTotalNum : calcTotal
              return (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-md shadow-blue-600/10">
                  <p className="text-xs font-medium text-blue-600">Bill Amount</p>
                  <p className="mt-1 text-base font-bold text-blue-800">
                    ₹{displayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  {isOwnerOrAdmin && billTotalManual && otherCharges !== 0 && (
                    <p className="text-xs mt-1 text-blue-500">
                      Calc. ₹{calcTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      {' · '}
                      <span className={otherCharges > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                        {otherCharges > 0 ? '+' : ''}₹{Math.abs(otherCharges).toLocaleString('en-IN', { minimumFractionDigits: 2 })} other charges
                      </span>
                    </p>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="ui-card p-0 overflow-hidden">
            <div className={`grid gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
              isOwnerOrAdmin
                ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]'
                : 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)]'
            }`}>
              <span>Tank</span>
              <span>Fuel</span>
              <span className="text-right">Quantity</span>
              {isOwnerOrAdmin && <span className="text-right">Rate</span>}
              {isOwnerOrAdmin && <span className="text-right">Amount</span>}
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div key={item.tankId} className="px-4 py-3">
                  <div className={`grid gap-3 items-center text-sm ${
                    isOwnerOrAdmin
                      ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]'
                      : 'grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)]'
                  }`}>
                    <span className="font-semibold text-slate-800">{item.tankIdentifier}</span>
                    <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${FUEL_COLORS[item.fuelType]?.badge ?? FUEL_COLORS.PETROL.badge}`}>
                      {item.fuelType}
                    </span>
                    <span className="text-right text-slate-600">
                      {item.quantityDelivered.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                    </span>
                    {isOwnerOrAdmin && (
                      <span className="text-right text-slate-500">
                        ₹{item.costPricePerUnit.toFixed(4)}/L
                      </span>
                    )}
                    {isOwnerOrAdmin && (
                      <span className="text-right font-semibold text-slate-800">
                        ₹{item.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  {item.stockAfter !== null && (
                    <p className="mt-2 text-xs text-slate-500">
                      Stock after delivery: <span className="font-medium text-slate-700">
                        {item.stockAfter.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                      </span>
                      {item.capacity !== null && ` / ${item.capacity.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L capacity`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ui-modal-footer">
          <button
            type="button"
            onClick={onBack}
            disabled={isPending}
            className="ui-btn ui-btn-secondary flex-1"
          >
            Back to Edit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="ui-btn ui-btn-primary flex-1"
          >
            {isPending ? 'Recording…' : `Confirm ${items.length > 1 ? 'Deliveries' : 'Delivery'}`}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
