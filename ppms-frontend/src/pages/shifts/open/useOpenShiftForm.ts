import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import { pumpApi } from '../../../api/pumpApi'
import { userApi } from '../../../api/userApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { DUOption, NozzleDetail, OpenShiftRequest, Shift } from '../../../types/shift'
import { parseApiError } from '../../../utils/apiError'
import { useToastStore } from '../../../store/toastStore'
import { activeNozzlesOf } from './openShiftNozzles'

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

interface Options {
  pumpId: number
  activeShifts: Shift[]
  onClose: () => void
  prefilledDuId?: number
  prefilledNozzleIds?: number[]
}

export function useOpenShiftForm({ pumpId, activeShifts, onClose, prefilledDuId, prefilledNozzleIds }: Options) {
  const { t } = useTranslation('shifts')
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()

  const [selectedDU, setSelectedDU]                 = useState<DUOption | null>(null)
  const [selectedNozzleIds, setSelectedNozzleIds]   = useState<Set<number>>(new Set())
  const [selectedOperatorId, setSelectedOperatorId] = useState<number | null>(null)
  const [operatorSearch, setOperatorSearch]         = useState('')
  const [readingConfirmed, setReadingConfirmed]     = useState(false)
  const [validationError, setValidationError]       = useState<string | null>(null)
  const [serverError, setServerError]               = useState<string | null>(null)

  const busyNozzleOperators = new Map(activeShifts.flatMap((s) => s.nozzles.map((n) => [n.id, s.operatorName] as const)))
  const busyOperatorIds = new Set(activeShifts.map((s) => s.operatorId))
  const freeNozzleIdsOf = (du: DUOption) =>
    activeNozzlesOf(du).filter((n) => !busyNozzleOperators.has(n.id)).map((n) => n.id)

  const { data: dus = [], isLoading: dusLoading } = useQuery({
    queryKey: ['dus', pumpId],
    queryFn:  () => pumpApi.getDUs(pumpId),
  })

  const { data: operators = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['operators', pumpId],
    queryFn:  () => userApi.getOperators(pumpId),
  })

  const { data: activeDefinitions = [] } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn:  () => shiftDefinitionApi.getActive(pumpId),
  })

  // Auto-select the DU and nozzles of a just-closed shift, or the only DU and its free nozzles
  useEffect(() => {
    if (!dus.length || selectedDU) return
    const activeDus = dus.filter(d => d.status === 'ACTIVE')
    const prefilledDu = prefilledDuId ? activeDus.find(d => d.id === prefilledDuId) : undefined
    if (prefilledDu) {
      setSelectedDU(prefilledDu)
      setSelectedNozzleIds(new Set(
        (prefilledNozzleIds ?? []).filter(id => prefilledDu.nozzles.some(n => n.id === id) && !busyNozzleOperators.has(id))
      ))
      return
    }
    if (activeDus.length !== 1) return
    setSelectedDU(activeDus[0])
    setSelectedNozzleIds(new Set(freeNozzleIdsOf(activeDus[0])))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dus])

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

  const activeDUs = dus.filter((d) => d.status === 'ACTIVE')

  const availableOperators = operators.filter((o) => {
    if (busyOperatorIds.has(o.id)) return false
    if (isNightShift && o.gender === 'FEMALE' && !o.nightShiftConsent) return false
    return true
  })
  const filteredOperators = availableOperators.filter((o) =>
    o.fullName.toLowerCase().includes(operatorSearch.toLowerCase())
  )
  const selectedOperator = operators.find((o) => o.id === selectedOperatorId)

  const changeNozzles = (nozzleIds: Set<number>) => {
    setSelectedNozzleIds(nozzleIds)
    setReadingConfirmed(false)
  }

  /** Returns true when a different DU was picked, which clears the nozzles and the readings confirmation. */
  const selectDU = (du: DUOption): boolean => {
    setValidationError(null)
    if (selectedDU?.id === du.id) return false
    setSelectedDU(du)
    changeNozzles(new Set())
    return true
  }

  const toggleNozzle = (nozzle: NozzleDetail) => {
    if (busyNozzleOperators.has(nozzle.id)) return
    const next = new Set(selectedNozzleIds)
    if (next.has(nozzle.id)) next.delete(nozzle.id)
    else next.add(nozzle.id)
    changeNozzles(next)
  }

  const selectAllFreeNozzles = () => {
    if (selectedDU) changeNozzles(new Set(freeNozzleIdsOf(selectedDU)))
  }

  const clearNozzles = () => changeNozzles(new Set())

  const selectOperator = (operatorId: number) => {
    setSelectedOperatorId(operatorId)
    setValidationError(null)
  }

  const confirmReadings = (checked: boolean) => {
    setReadingConfirmed(checked)
    setValidationError(null)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setServerError(null)

    if (!selectedDU)                    { setValidationError(t('open.validation.selectDu')); return }
    if (selectedNozzleIds.size === 0)   { setValidationError(t('open.validation.selectNozzle')); return }
    if (!selectedOperatorId)            { setValidationError(t('open.validation.selectOperator')); return }
    if (!readingConfirmed)              { setValidationError(t('open.validation.confirmReadings')); return }

    openMutation.mutate({
      duId:       selectedDU.id,
      nozzleIds:  Array.from(selectedNozzleIds),
      operatorId: selectedOperatorId,
    })
  }

  const selectedNozzles = selectedDU ? selectedDU.nozzles.filter((n) => selectedNozzleIds.has(n.id)) : []
  const allFreeNozzlesSelected = selectedDU !== null
    && freeNozzleIdsOf(selectedDU).every((id) => selectedNozzleIds.has(id))

  const stillNeeded = [
    !selectedDU && t('open.missing.du'),
    selectedNozzleIds.size === 0 && t('open.missing.nozzle'),
    !selectedOperatorId && t('open.missing.operator'),
    !readingConfirmed && t('open.missing.readings'),
  ].filter((item): item is string => typeof item === 'string')

  return {
    dusLoading, activeDUs, busyNozzleOperators,
    operatorsLoading, availableOperators, filteredOperators, operatorSearch, setOperatorSearch,
    selectedDU, selectedNozzleIds, selectedNozzles, allFreeNozzlesSelected, selectedOperatorId, selectedOperator,
    readingConfirmed,
    selectDU, toggleNozzle, selectAllFreeNozzles, clearNozzles, selectOperator, confirmReadings, handleSubmit,
    stillNeeded,
    errorMessage: validationError ?? serverError,
    isOpening: openMutation.isPending,
  }
}
