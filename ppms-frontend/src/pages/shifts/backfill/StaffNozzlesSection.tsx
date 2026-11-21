import { FUEL_LABELS } from '../../../constants/fuel'
import { SectionLabel } from './SectionLabel'
import type { BackfillForm } from './useBackfillForm'

export function StaffNozzlesSection({ form }: { form: BackfillForm }) {
  const { selectedDU, operatorId, setOperatorId, operatorSearch, setOperatorSearch, selectedNozzleIds, operatorsLoading, filteredOperators, availableNozzles, toggleNozzle, selectedOperator } = form
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <SectionLabel>Staff &amp; Nozzles</SectionLabel>

      <div>
        <span className="ui-label">Operator on Duty <span className="text-red-500">*</span></span>
        {operatorsLoading ? (
          <div className="ui-input text-slate-500 text-sm">Loading operators…</div>
        ) : (
          <>
            <input aria-label="Operator on Duty"
              type="text"
              placeholder="Search by name or ID…"
              value={operatorSearch}
              onChange={(e) => setOperatorSearch(e.target.value)}
              className="ui-input mb-1.5"
            />
            <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
              {filteredOperators.length === 0 ? (
                <p className="text-xs text-slate-500 px-3 py-2">No operators found.</p>
              ) : (
                filteredOperators.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => { setOperatorId(op.id); setOperatorSearch('') }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      operatorId === op.id
                        ? 'bg-violet-50 text-violet-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {op.fullName}
                    <span className="ml-2 text-xs text-slate-500 font-mono">{op.employeeId}</span>
                  </button>
                ))
              )}
            </div>
            {selectedOperator && (
              <p className="text-xs text-violet-700 mt-1 font-medium">
                Selected: {selectedOperator.fullName}
              </p>
            )}
          </>
        )}
      </div>

      {selectedDU && (
        <div>
          <span className="ui-label">Nozzles <span className="text-red-500">*</span></span>
          {availableNozzles.length === 0 ? (
            <p className="text-xs text-slate-500">No nozzles configured on this DU.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableNozzles.map((nozzle) => {
                const selected = selectedNozzleIds.has(nozzle.id)
                return (
                  <button
                    key={nozzle.id}
                    type="button"
                    onClick={() => toggleNozzle(nozzle.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                      selected
                        ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                        : 'border-slate-300 text-slate-600 bg-white hover:border-violet-400 hover:text-violet-700'
                    }`}
                  >
                    #{nozzle.nozzleNumber} · {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
