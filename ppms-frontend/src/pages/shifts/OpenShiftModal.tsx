import { useEffect, useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import type { DUOption, NozzleDetail, OpenShiftRequest, Shift } from '../../types/shift'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { FUEL_UNIT } from '../../constants/fuel'
import { codeLabel } from '../../constants/labels'
import { formatDecimal } from '../../utils/format'
import { OperatorPicker } from './components/OperatorPicker'
import { useToastStore } from '../../store/toastStore'

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
  const { t } = useTranslation(['shifts', 'common'])
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const [selectedDU, setSelectedDU]                 = useState<DUOption | null>(null)
  const [selectedNozzleIds, setSelectedNozzleIds]   = useState<Set<number>>(new Set())
  const [selectedOperatorId, setSelectedOperatorId] = useState<number | null>(null)
  const [operatorSearch, setOperatorSearch]         = useState('')
  const [readingConfirmed, setReadingConfirmed]     = useState(false)
  const [validationError, setValidationError]       = useState<string | null>(null)
  const [serverError, setServerError]               = useState<string | null>(null)
  const stillNeededId = useId()

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

  // Auto-select the DU and nozzles of a just-closed shift, or the only DU and its free nozzles
  useEffect(() => {
    if (!dus.length || selectedDU) return
    const activeDus = dus.filter(d => d.status === 'ACTIVE')
    const prefilledDu = prefilledDuId ? activeDus.find(d => d.id === prefilledDuId) : undefined
    if (prefilledDu) {
      setSelectedDU(prefilledDu)
      setSelectedNozzleIds(new Set(
        (prefilledNozzleIds ?? []).filter(id => prefilledDu.nozzles.some(n => n.id === id) && !busyNozzleIds.has(id))
      ))
      return
    }
    if (activeDus.length !== 1) return
    const onlyDu = activeDus[0]
    setSelectedDU(onlyDu)
    setSelectedNozzleIds(new Set(
      onlyDu.nozzles.filter(n => n.status === 'ACTIVE' && !busyNozzleIds.has(n.id)).map(n => n.id)
    ))
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
    onSuccess: (shift) => {
      queryClient.invalidateQueries({ queryKey: ['activeShifts', pumpId] })
      addToast(t('open.opened', { name: shift.operatorName }), 'success')
      onClose()
    },
    onError: (err) =>
      setServerError(parseApiError(err, t('open.failed'))),
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

    if (!selectedDU)                    { setValidationError(t('open.validation.selectDu')); return }
    if (selectedNozzleIds.size === 0)   { setValidationError(t('open.validation.selectNozzle')); return }
    if (!selectedOperatorId)            { setValidationError(t('open.validation.selectOperator')); return }
    if (!readingConfirmed)              { setValidationError(t('open.validation.confirmReadings')); return }

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

  const stillNeeded = [
    !selectedDU && t('open.missing.du'),
    selectedNozzleIds.size === 0 && t('open.missing.nozzle'),
    !selectedOperatorId && t('open.missing.operator'),
    !readingConfirmed && t('open.missing.readings'),
  ].filter((item): item is string => typeof item === 'string')

  const choiceClass = (isSelected: boolean) => `flex flex-col items-center gap-1 rounded-card border-2 p-3 transition-colors ${
    isSelected ? 'border-primary bg-info-bg' : 'border-border hover:border-primary hover:bg-bg'
  }`

  return (
    <Modal
      title={t('open.title')}
      subtitle={t('open.subtitle')}
      tone="success"
      size="md-wide"
      fullScreenOnPhone
      onClose={onClose}
      canClose={!openMutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-5"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} disabled={openMutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" disabled={stillNeeded.length > 0} isLoading={openMutation.isPending}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          loadingLabel={t('open.opening')} className="ui-btn-primary">
          {t('open.submit')}
        </LoadingButton>
      </>}
    >
      <section aria-labelledby={`${stillNeededId}-du`}>
        <h3 id={`${stillNeededId}-du`} className="ui-label mb-2">{t('open.duHeading')}</h3>
        {dusLoading ? (
          <p className="ui-empty">{t('open.loadingDus')}</p>
        ) : activeDUs.length === 0 ? (
          <p className="ui-alert ui-alert-warning text-sm">{t('open.noDus')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeDUs.map((du) => {
              const isSelected = selectedDU?.id === du.id
              const fuelTypes = [...new Set(du.nozzles.filter((n) => n.status === 'ACTIVE').map((n) => codeLabel(n.fuelType)))]
              return (
                <button key={du.id} type="button" aria-pressed={isSelected}
                  onClick={() => handleSelectDU(du)} className={choiceClass(isSelected)}>
                  <span className="text-xs font-medium text-ink-3">{t('open.duNumber', { number: du.duNumber })}</span>
                  <span className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-ink'}`}>{du.name}</span>
                  <span className="text-xs text-ink-3">{fuelTypes.join(' · ')}</span>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" />{t('open.selected')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {selectedDU && (
        <section aria-labelledby={`${stillNeededId}-nozzles`}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 id={`${stillNeededId}-nozzles`} className="ui-label mb-0">{t('open.nozzlesHeading')}</h3>
            {selectedNozzleIds.size > 0 && (
              <span className="text-xs text-ink-3">{t('open.selectedCount', { count: selectedNozzleIds.size })}</span>
            )}
          </div>
          <div role="group" aria-label={t('open.selectNozzles')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {selectedDU.nozzles.filter((n) => n.status === 'ACTIVE').map((nozzle) => {
              const isBusy     = busyNozzleIds.has(nozzle.id)
              const isSelected = selectedNozzleIds.has(nozzle.id)
              return (
                <button key={nozzle.id} type="button" aria-pressed={isSelected}
                  disabled={isBusy}
                  onClick={() => handleNozzleToggle(nozzle)}
                  className={`${choiceClass(isSelected)} disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:opacity-60`}
                >
                  <span className={`text-lg font-semibold ${isSelected ? 'text-primary' : 'text-ink'}`}>#{nozzle.nozzleNumber}</span>
                  <span className="text-xs text-ink-3">{codeLabel(nozzle.fuelType)}</span>
                  {isBusy
                    ? <span className="text-xs text-ink-3">{t('open.inUse')}</span>
                    : isSelected && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <Check size={12} strokeWidth={2.5} aria-hidden="true" />{t('open.selected')}
                      </span>
                    )}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <OperatorPicker
        title={t('open.assignOperator')}
        showStepNumber={false}
        operatorsLoading={operatorsLoading}
        noneAvailable={availableOperators.length === 0}
        filteredOperators={filteredOperators}
        operatorSearch={operatorSearch}
        onSearchChange={setOperatorSearch}
        selectedOperatorId={selectedOperatorId}
        onSelect={setSelectedOperatorId}
      />

      {selectedNozzles.length > 0 && (
        <section aria-labelledby={`${stillNeededId}-readings`} className="rounded-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${stillNeededId}-readings`} className="text-sm font-semibold text-ink">{t('open.currentReadings')}</h3>
            <StatusBadge tone="neutral" icon={Lock} label={t('open.readOnly')} />
          </div>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {selectedNozzles.map((nozzle) => (
              <div key={nozzle.id} className="flex items-baseline justify-between gap-3 rounded-control bg-surface-sunken px-3 py-2">
                <dt className="text-xs text-ink-2">
                  {t('open.nozzleReadingLabel', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType) })}
                </dt>
                <dd className="text-sm font-semibold text-ink tabular-nums">
                  {formatDecimal(nozzle.lastReading)} {FUEL_UNIT[nozzle.fuelType] ?? 'L'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="ui-help mt-0">
            {t('open.readingsNote')}{' '}
            <span className="font-medium text-ink-2">{t('open.readingsNotePath')}</span>{t('open.readingsNoteEnd')}
          </p>
          <label className="ui-check-row">
            <input
              type="checkbox"
              checked={readingConfirmed}
              onChange={(e) => { setReadingConfirmed(e.target.checked); setValidationError(null) }}
            />
            <span>{t('open.confirmReadings')}</span>
          </label>
        </section>
      )}

      {(validationError || serverError) && (
        <p role="alert" className="ui-alert ui-alert-danger">{validationError ?? serverError}</p>
      )}
    </Modal>
  )
}
