import { ChevronRight } from 'lucide-react'
import type { FuelPrice, TankInfo } from '../../../api/pumpApi'
import type { DUOption } from '../../../types/shift'
import { onActivateKey } from '../../../utils/keyboard'
import type { NozzlePanel } from './nozzlePanels'
import { NozzleRow } from './NozzleRow'
import { AddNozzleForm } from './AddNozzleForm'

interface Props {
  pumpId: number
  du: DUOption
  isExpanded: boolean
  onToggle: () => void
  tanks: TankInfo[]
  currentPrices: FuelPrice[]
  openPanelFor: (nozzleId: number) => NozzlePanel | null
  onOpenPanel: (nozzleId: number, panel: NozzlePanel) => void
  onClosePanel: () => void
  openMenu: number | null
  onMenuChange: (nozzleId: number | null) => void
  statusPending: boolean
  statusError: string | null
  onStatusChange: (nozzleId: number, status: 'ACTIVE' | 'INACTIVE') => void
  addingNozzle: boolean
  onStartAddNozzle: () => void
  onStopAddNozzle: () => void
}

export function DuCard({
  pumpId, du, isExpanded, onToggle, tanks, currentPrices, openPanelFor, onOpenPanel, onClosePanel,
  openMenu, onMenuChange, statusPending, statusError, onStatusChange, addingNozzle, onStartAddNozzle, onStopAddNozzle,
}: Props) {
  const isDUInactive = du.status === 'INACTIVE'
  return (
    <div key={du.id} className={`border rounded-xl bg-white transition-opacity ${isDUInactive ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      {/* DU header — click to expand/collapse */}
      <div
        className={`flex items-center justify-between px-4 py-3 bg-slate-50 border-slate-100 cursor-pointer select-none ${isExpanded ? 'rounded-t-xl border-b' : 'rounded-xl'}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={onActivateKey(onToggle)}
      >
        <div className="flex items-center gap-2">
          <ChevronRight size={14} strokeWidth={2} className={`transition-transform duration-200 text-slate-500 ${isExpanded ? 'rotate-90' : ''}`} />
          <span className="text-xs font-bold text-slate-500">DU #{du.duNumber}</span>
          <span className="text-sm font-bold text-slate-700">{du.name}</span>
          {isDUInactive && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-orange-50 text-orange-700 border-orange-200">
              Inactive
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">{du.nozzles.filter((n) => n.status === 'ACTIVE').length} active nozzle(s)</span>
      </div>


      {/* Nozzle rows + inline add form — only when expanded */}
      {isExpanded && (<>
      <div className="divide-y divide-slate-50">
        {du.nozzles.map((nozzle) => (
          <NozzleRow
            key={nozzle.id}
            pumpId={pumpId}
            du={du}
            nozzle={nozzle}
            tanks={tanks}
            currentPrices={currentPrices}
            openPanel={openPanelFor(nozzle.id)}
            onOpenPanel={(panel) => onOpenPanel(nozzle.id, panel)}
            onClosePanel={onClosePanel}
            menuOpen={openMenu === nozzle.id}
            onMenuChange={onMenuChange}
            statusPending={statusPending}
            statusError={statusError}
            onEnable={() => onStatusChange(nozzle.id, 'ACTIVE')}
            onDisable={() => onStatusChange(nozzle.id, 'INACTIVE')}
          />
        ))}
      </div>

      {/* Add Nozzle action row */}
      {!isDUInactive && du.nozzles.length < 9 && !addingNozzle && (
        <button
          type="button"
          onClick={onStartAddNozzle}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 border-t border-dashed border-slate-200 transition-colors rounded-b-xl"
        >
          <span className="text-base leading-none">+</span>
          Add Nozzle
        </button>
      )}

      {/* Inline add-nozzle form */}
      {addingNozzle && <AddNozzleForm pumpId={pumpId} du={du} onClose={onStopAddNozzle} />}
      </>)}
    </div>
  )
}
