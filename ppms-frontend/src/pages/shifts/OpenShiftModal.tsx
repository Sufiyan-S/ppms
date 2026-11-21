import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import type { DUOption, NozzleDetail, OpenShiftRequest, Shift } from '../../types/shift'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { FUEL_LABELS, FUEL_UNIT } from '../../constants/fuel'
import { OperatorPicker } from './components/OperatorPicker'
import { IconButton } from '../../components/IconButton'

/** Stored end times are inclusive (08:59 means the shift runs until 09:00), so the end minute is inside the window. */
function isTimeInWindow(startTime: string, endTime: string, crossesMidnight: boolean, nowHHMM: string): boolean {
  const start = startTime.substring(0, 5)
  const end   = endTime.substring(0, 5)
  if (crossesMidnight) {
    return nowHHMM >= start || nowHHMM <= end
  }
  return nowHHMM >= start && nowHHMM <= end
}

const IST_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})



interface Props {
  pumpId: number
  activeShifts: Shift[]
  onClose: () => void
  prefilledDuId?: number
  prefilledNozzleIds?: number[]
}

export default function OpenShiftModal({ pumpId, activeShifts, onClose, prefilledDuId, prefilledNozzleIds }: Props) {
  const queryClient = useQueryClient()

  const [selectedDU, setSelectedDU]                 = useState<DUOption | null>(null)
  const [selectedNozzleIds, setSelectedNozzleIds]   = useState<Set<number>>(new Set())
  const [selectedOperatorId, setSelectedOperatorId] = useState<number | null>(null)
  const [operatorSearch, setOperatorSearch]         = useState('')
  const [readingConfirmed, setReadingConfirmed]     = useState(false)
  const [validationError, setValidationError]       = useState<string | null>(null)
  const [serverError, setServerError]               = useState<string | null>(null)

  // Nozzle IDs already in an open shift (locked out)
  const busyNozzleIds   = new Set(activeShifts.flatMap((s) => s.nozzles.map((n) => n.id)))
  const busyOperatorIds = new Set(activeShifts.map((s) => s.operatorId))

  const { data: dus = [], isLoading: dusLoading } = useQuery({
    queryKey: ['dus', pumpId],
    queryFn:  () => pumpApi.getDUs(pumpId),
  })

  const { data: operators = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['operators', pumpId],
    queryFn:  () => userApi.getOperators(pumpId),
  })

  // Auto-select DU and nozzles when opened from a just-closed shift
  useEffect(() => {
    if (!prefilledDuId || !dus.length || selectedDU) return
    const du = dus.find(d => d.id === prefilledDuId && d.status === 'ACTIVE')
    if (!du) return
    setSelectedDU(du)
    const ids = new Set(
      (prefilledNozzleIds ?? []).filter(id => du.nozzles.some(n => n.id === id) && !busyNozzleIds.has(id))
    )
    setSelectedNozzleIds(ids)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dus])

  const { data: activeDefinitions = [] } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn:  () => shiftDefinitionApi.getActive(pumpId),
  })

  const nowHHMM = IST_TIME_FORMAT.format(new Date())
  const currentDefinition = activeDefinitions.find(d =>
    isTimeInWindow(d.startTime, d.endTime, d.crossesMidnight, nowHHMM)
  )
  const isNightShift = currentDefinition?.isNightShift ?? false

  const openMutation = useMutation({
    mutationFn: (req: OpenShiftRequest) => shiftApi.openShift(pumpId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeShifts', pumpId] })
      onClose()
    },
    onError: (err) =>
      setServerError(parseApiError(err, 'Failed to open shift. Please try again.')),
  })

  // Only ACTIVE DUs are available for shift open
  const activeDUs = dus.filter((d) => d.status === 'ACTIVE')

  const availableOperators = operators.filter((o) => {
    if (busyOperatorIds.has(o.id)) return false
    if (isNightShift && o.gender === 'FEMALE' && !o.nightShiftConsent) return false
    return true
  })
  const filteredOperators = availableOperators.filter((o) =>
    o.fullName.toLowerCase().includes(operatorSearch.toLowerCase())
  )

  const handleSelectDU = (du: DUOption) => {
    if (selectedDU?.id === du.id) return
    setSelectedDU(du)
    setSelectedNozzleIds(new Set())
    setReadingConfirmed(false)
    setValidationError(null)
  }

  const handleNozzleToggle = (nozzle: NozzleDetail) => {
    if (busyNozzleIds.has(nozzle.id)) return
    setReadingConfirmed(false)
    setSelectedNozzleIds((prev) => {
      const next = new Set(prev)
      if (next.has(nozzle.id)) next.delete(nozzle.id)
      else next.add(nozzle.id)
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setServerError(null)

    if (!selectedDU)                    { setValidationError('Please select a Dispensary Unit'); return }
    if (selectedNozzleIds.size === 0)   { setValidationError('Please select at least one nozzle'); return }
    if (!selectedOperatorId)            { setValidationError('Please select an operator'); return }
    if (!readingConfirmed)              { setValidationError('Please confirm the meter readings are correct'); return }

    const req: OpenShiftRequest = {
      duId:       selectedDU.id,
      nozzleIds:  Array.from(selectedNozzleIds),
      operatorId: selectedOperatorId,
    }
    openMutation.mutate(req)
  }

  const selectedNozzles = selectedDU
    ? selectedDU.nozzles.filter((n) => selectedNozzleIds.has(n.id))
    : []

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Open New Shift</h2>
            <p className="ui-modal-subtitle">Select a Dispensary Unit and assign an operator</p>
          </div>
          <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="ui-modal-body space-y-5">

          {/* ── Step 1: Select DU ── */}
          <div>
            <span className="ui-label uppercase tracking-wide mb-2">
              Step 1 — Select Dispensary Unit
              {selectedDU && (
                <span className="ml-2 text-blue-600 font-semibold normal-case">
                  DU #{selectedDU.duNumber} — {selectedDU.name}
                </span>
              )}
            </span>
            {dusLoading ? (
              <p className="ui-empty">Loading dispensary units...</p>
            ) : activeDUs.length === 0 ? (
              <div className="ui-alert ui-alert-warning text-xs">
                No active Dispensary Units found. Add one in Setup first.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {activeDUs.map((du) => {
                  const isSelected = selectedDU?.id === du.id
                  const fuelTypes = du.nozzles
                    .filter((n) => n.status === 'ACTIVE')
                    .map((n) => FUEL_LABELS[n.fuelType] ?? n.fuelType)
                  return (
                    <button key={du.id} type="button"
                      onClick={() => handleSelectDU(du)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`text-xs font-bold ${isSelected ? 'text-blue-500' : 'text-slate-500'}`}>
                        DU #{du.duNumber}
                      </span>
                      <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {du.name}
                      </span>
                      <div className="flex flex-wrap gap-0.5 justify-center">
                        {fuelTypes.map((tag) => (
                          <span key={tag} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold"><Check size={11} strokeWidth={2.5} />Selected</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Step 2: Select Nozzles from selected DU ── */}
          {selectedDU && (
            <div>
              <span className="ui-label uppercase tracking-wide mb-2">
                Step 2 — Select Nozzle(s)
                {selectedNozzleIds.size > 0 && (
                  <span className="ml-2 text-blue-600 font-semibold normal-case">
                    {selectedNozzleIds.size} selected
                  </span>
                )}
              </span>
              <div role="group" aria-label="Select nozzles" className="grid grid-cols-3 gap-2">
                {selectedDU.nozzles.filter((n) => n.status === 'ACTIVE').map((nozzle) => {
                  const isBusy     = busyNozzleIds.has(nozzle.id)
                  const isSelected = selectedNozzleIds.has(nozzle.id)
                  return (
                    <button key={nozzle.id} type="button"
                      disabled={isBusy}
                      onClick={() => handleNozzleToggle(nozzle)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                        isBusy
                          ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                          : isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`text-xl font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        #{nozzle.nozzleNumber}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
                      </span>
                      {isBusy
                        ? <span className="text-xs text-slate-500">In use</span>
                        : isSelected && <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold"><Check size={11} strokeWidth={2.5} />Selected</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Operator ── */}
          <OperatorPicker
            showStepNumber={!!selectedDU}
            operatorsLoading={operatorsLoading}
            noneAvailable={availableOperators.length === 0}
            filteredOperators={filteredOperators}
            operatorSearch={operatorSearch}
            onSearchChange={setOperatorSearch}
            selectedOperatorId={selectedOperatorId}
            onSelect={setSelectedOperatorId}
          />

          {/* ── Current meter readings (acknowledgment) ── */}
          {selectedNozzles.length > 0 && (
            <div className="ui-card-plain ui-card-muted p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Current Meter Readings
                </span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  Read-only
                </span>
              </div>
              <div className={`grid gap-2 ${selectedNozzles.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {selectedNozzles.map((nozzle) => (
                  <div key={nozzle.id} className="ui-card-plain bg-white border-slate-200 px-3 py-2.5">
                    <p className="text-xs text-slate-500 mb-0.5">
                      Nozzle #{nozzle.nozzleNumber} — {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType} ({FUEL_UNIT[nozzle.fuelType] ?? 'L'})
                    </p>
                    <p className="text-base font-semibold text-slate-800">
                      {nozzle.lastReading.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                These readings are set automatically from the last shift close.
                If a reading looks incorrect, an Admin must update it in{' '}
                <span className="font-medium text-slate-700">Setup → Nozzle → Adjust Reading</span> first.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={readingConfirmed}
                  onChange={(e) => { setReadingConfirmed(e.target.checked); setValidationError(null) }}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-slate-600 leading-relaxed group-hover:text-slate-800 transition-colors">
                  I confirm the meter readings above are correct and authorise opening this shift.
                </span>
              </label>
            </div>
          )}

          {/* ── Errors ── */}
          {(validationError || serverError) && (
            <div role="alert" className="ui-alert ui-alert-danger">
              <p className="text-red-600 text-sm">{validationError ?? serverError}</p>
            </div>
          )}

          </div>{/* end ui-modal-body */}

          {/* ── Actions ── */}
          <div className="ui-modal-footer">
            <button type="button" onClick={onClose}
              className="ui-btn ui-btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedDU || selectedNozzleIds.size === 0 || !selectedOperatorId || !readingConfirmed || openMutation.isPending}
              className="ui-btn ui-btn-primary flex-1 disabled:bg-blue-300 disabled:cursor-not-allowed">
              {openMutation.isPending ? 'Opening...' : 'Open Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}
