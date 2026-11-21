import { Link } from 'react-router-dom'
import type { TankStock } from '../../../api/inventoryApi'
import { Reveal } from '../../../components/Reveal'

export function TankStockOverview({ tanks: allTanks }: { tanks: TankStock[] }) {
  return (
    <>
    {allTanks.length > 0 && (
      <Reveal delay={295}>
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">Tank Stock Overview</p>
          <Link to="/dashboard/inventory"
            className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
            Full inventory →
          </Link>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allTanks.map(tank => {
            const pct = Math.min(100, Math.max(0, tank.stockPercentage))
            const barColor = tank.lowStock
              ? 'bg-red-500'
              : tank.fuelType === 'PETROL'
                ? 'bg-emerald-500'
                : tank.fuelType === 'DIESEL'
                  ? 'bg-blue-500'
                  : 'bg-amber-500'

            return (
            <div key={tank.tankId} className="ui-card-plain ui-card-muted px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-700">{tank.tankIdentifier}</span>
                    <span className="text-xs text-slate-500">{tank.fuelType}</span>
                    {tank.lowStock && (
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full leading-none">Low</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${tank.lowStock ? 'text-red-600' : 'text-slate-500'}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div
                  className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${tank.tankIdentifier} stock: ${pct.toFixed(0)}%${tank.lowStock ? ' – low stock' : ''}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor} ${tank.lowStock ? 'animate-pulse' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L remaining
                </p>
              </div>
            )
          })}
        </div>
      </div>
      </Reveal>
    )}
    </>
  )
}
