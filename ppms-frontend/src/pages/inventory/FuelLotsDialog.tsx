import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, InventoryLotDetail } from '../../api/inventoryApi'
import { ModalPortal } from '../../components/ModalPortal'
import { FUEL_COLORS, fmtDate } from './inventoryFormat'

export function FuelLotsDialog({
  pumpId, tank, onClose,
}: {
  pumpId: number
  tank: TankStock
  onClose: () => void
}) {
  const { data: lots = [], isLoading } = useQuery<InventoryLotDetail[]>({
    queryKey: ['fuelLots', pumpId, tank.tankId],
    queryFn:  () => inventoryApi.getActiveTankLots(pumpId, tank.tankId),
  })

  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel ui-modal-panel--lg w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="ui-modal-header shrink-0">
          <div className="ui-modal-heading flex items-center gap-2.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cols.badge}`}>
              {tank.fuelType}
            </span>
            <div>
              <h3 className="ui-modal-title">Stock Lots — {tank.tankIdentifier}</h3>
              <p className="ui-modal-subtitle">
                Current stock: {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
              </p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Body */}
        <div className="ui-modal-body overflow-auto flex-1">
          {isLoading ? (
            <p className="ui-empty py-8">Loading lots…</p>
          ) : lots.length === 0 ? (
            <p className="ui-empty py-8">
              No active stock lots for this tank. Record a tanker delivery first.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th scope="col" className="text-left pb-2 pr-4 font-medium">In Date</th>
                  <th scope="col" className="text-left pb-2 pr-4 font-medium">Invoice / Bill No</th>
                  <th scope="col" className="text-right pb-2 pr-4 font-medium">Cost Price/L</th>
                  <th scope="col" className="text-right pb-2 pr-4 font-medium">Remaining (L)</th>
                  <th scope="col" className="text-right pb-2 font-medium">Original (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lots.map((lot, idx) => (
                  <tr key={lot.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {lot.isDipAdjustment
                        ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">DIP Adj.</span>
                        : (lot.invoiceReference ?? '—')}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-800">
                      {lot.isDipAdjustment
                        ? <span className="text-slate-500">—</span>
                        : `₹${Number(lot.costPricePerUnit).toFixed(4)}`}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className="font-semibold text-emerald-700">
                        {Number(lot.remainingQuantity).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-500">
                      {Number(lot.originalQuantity).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="ui-modal-footer shrink-0 justify-between items-center">
          <p className="text-xs text-slate-500">
            Lots shown in FIFO order — oldest consumed first
          </p>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
