import { Fuel, Users, X } from 'lucide-react'
import type { PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { EditPumpForm } from './EditPumpForm'

interface PumpCardProps {
  pump: PumpSummary
  isEditOpen: boolean
  onToggleEdit: () => void
  onToggleEnabled: () => void
  isSaving: boolean
  editError: string | null
  onSaveEdit: (data: UpdatePumpRequest) => void
}

export function PumpCard({ pump, isEditOpen, onToggleEdit, onToggleEnabled, isSaving, editError, onSaveEdit }: PumpCardProps) {
  return (
    <div className={`rounded-lg border p-2.5 ${
      pump.enabled ? 'border-slate-100 bg-slate-50/50' : 'border-red-100 bg-red-50/30 opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 text-xs min-w-0">
          <Fuel size={12} strokeWidth={1.8} className="text-slate-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-semibold ${!pump.enabled ? 'line-through text-slate-500' : 'text-slate-700'}`}>
                {pump.pumpName}
              </span>
              {!pump.enabled && (
                <span className="text-xs font-medium text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                  disabled
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-0.5">{pump.pumpAddress}</p>
            {/* Staff count badge */}
            <span className="inline-flex items-center gap-1 mt-1 text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
              <Users size={11} strokeWidth={2} />{pump.staffCount} staff
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleEdit}
            className={`ui-btn min-h-0 px-3 py-1 text-xs border transition-colors ${
              isEditOpen
                ? 'border-indigo-400 text-indigo-700 bg-indigo-50'
                : 'border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            {isEditOpen ? <X size={12} strokeWidth={2} /> : 'Edit'}
          </button>
          <button
            onClick={onToggleEnabled}
            disabled={isSaving}
            className={`ui-btn min-h-0 px-3 py-1 text-xs border transition-colors disabled:opacity-40 ${
              pump.enabled
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-600 hover:bg-green-50'
            }`}
          >
            {pump.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {isEditOpen && (
        <EditPumpForm pump={pump} isSaving={isSaving} error={editError} onSave={onSaveEdit} />
      )}
    </div>
  )
}
