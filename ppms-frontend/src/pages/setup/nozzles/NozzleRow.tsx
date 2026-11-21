import { useRef } from 'react'
import { AlertTriangle, Database, Wrench, Ruler, CircleOff } from 'lucide-react'
import type { FuelPrice, TankInfo } from '../../../api/pumpApi'
import type { DUOption, NozzleDetail } from '../../../types/shift'
import { Spinner } from '../../../components/Spinner'
import { RowActionMenu } from '../../../components/RowActionMenu'
import { useRowPanelFocus } from '../../../hooks/useRowPanelFocus'
import { FUEL_LABELS } from '../../../constants/fuel'
import { FUEL_COLOR } from '../fuelStyles'
import type { NozzlePanel } from './nozzlePanels'
import { DisableNozzlePanel } from './DisableNozzlePanel'
import { MapTankPanel } from './MapTankPanel'
import { AdjustReadingPanel } from './AdjustReadingPanel'
import { RecordDipPanel } from './RecordDipPanel'

interface Props {
  pumpId: number
  du: DUOption
  nozzle: NozzleDetail
  tanks: TankInfo[]
  currentPrices: FuelPrice[]
  openPanel: NozzlePanel | null
  onOpenPanel: (panel: NozzlePanel) => void
  onClosePanel: () => void
  menuOpen: boolean
  onMenuChange: (nozzleId: number | null) => void
  statusPending: boolean
  statusError: string | null
  onEnable: () => void
  onDisable: () => void
}

export function NozzleRow({
  pumpId, du, nozzle, tanks, currentPrices, openPanel, onOpenPanel, onClosePanel,
  menuOpen, onMenuChange, statusPending, statusError, onEnable, onDisable,
}: Props) {
  const isInactive = nozzle.status === 'INACTIVE'
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useRowPanelFocus(openPanel, panelRef, menuButtonRef)
  return (
    <div key={nozzle.id} className={`transition-opacity ${isInactive ? 'opacity-60' : ''}`}>
      {/* Nozzle row */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-700">#{nozzle.nozzleNumber}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FUEL_COLOR[nozzle.fuelType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
          </span>
          {isInactive && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-orange-50 text-orange-700 border-orange-200">
              Maintenance
            </span>
          )}
          {!isInactive && (
            <span className="text-xs text-slate-500">
              {FUEL_LABELS[nozzle.fuelType]}: {nozzle.lastReading}
            </span>
          )}
          {!isInactive && nozzle.tankId == null && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
              <AlertTriangle size={11} strokeWidth={2} />
              tank not mapped
            </span>
          )}
        </div>

        <div className="flex shrink-0 ml-2 items-center gap-2">
          {isInactive ? (
            <button
              type="button"
              onClick={() => onEnable()}
              disabled={statusPending}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-medium border border-emerald-300 hover:border-emerald-500 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
            >
              {statusPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Enabling…</span> : 'Enable'}
            </button>
          ) : (
            <RowActionMenu
              label="Nozzle actions"
              open={menuOpen}
              onOpenChange={(open) => onMenuChange(open ? nozzle.id : null)}
              triggerRef={menuButtonRef}
              triggerClassName="ui-btn ui-btn-ghost text-base leading-none text-slate-600 hover:text-slate-800"
              menuClassName="absolute right-0 top-full z-[6] mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg backdrop-blur"
              items={[
                { key: 'mapTank', label: 'Map Tank', description: 'Assign the supply tank', icon: <Database size={14} strokeWidth={2} />, className: 'text-emerald-700 hover:bg-emerald-50', onSelect: () => onOpenPanel('mapTank') },
                { key: 'reading', label: 'Adjust Reading', description: 'Correct stored meter value', icon: <Wrench size={14} strokeWidth={2} />, className: 'text-blue-700 hover:bg-blue-50', onSelect: () => onOpenPanel('reading') },
                { key: 'dip', label: 'Record Dip', description: 'Log a manual dip check', icon: <Ruler size={14} strokeWidth={2} />, className: 'text-orange-700 hover:bg-orange-50', onSelect: () => onOpenPanel('dip') },
                { key: 'disable', label: 'Disable for Maintenance', description: 'Temporarily take nozzle offline', icon: <CircleOff size={14} strokeWidth={2} />, className: 'text-red-700 hover:bg-red-50', onSelect: () => onOpenPanel('disable') },
              ]}
            />
          )}
        </div>
      </div>


      <div ref={panelRef}>
      {openPanel === 'disable' && (
        <DisableNozzlePanel
          nozzleNumber={nozzle.nozzleNumber}
          error={statusError}
          isPending={statusPending}
          onDisable={onDisable}
          onCancel={onClosePanel}
        />
      )}

      {openPanel === 'mapTank' && (
        <MapTankPanel pumpId={pumpId} duId={du.id} nozzle={nozzle} tanks={tanks} onClose={onClosePanel} />
      )}

      {openPanel === 'reading' && (
        <AdjustReadingPanel pumpId={pumpId} nozzle={nozzle} onClose={onClosePanel} />
      )}

      {openPanel === 'dip' && (
        <RecordDipPanel pumpId={pumpId} nozzle={nozzle} currentPrices={currentPrices} onClose={onClosePanel} />
      )}
      </div>
    </div>
  )
}
