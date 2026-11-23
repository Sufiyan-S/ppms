import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePumpStore } from '../../../store/usePumpStore'
import { userApi } from '../../../api/userApi'
import { shiftPlanApi } from '../../../api/shiftPlanApi'
import type { ShiftPlanEntry } from '../../../api/shiftPlanApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { useAuthStore } from '../../../store/authStore'
import { parseApiError } from '../../../utils/apiError'
import { addDays, istDateString, mondayOf } from '../../../utils/date'

export function useShiftPlanning() {
  const { t } = useTranslation('shifts')
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canSeeAttendance = isOwnerOrAdmin || user?.role === 'MANAGER'
  const queryClient = useQueryClient()

  const { selectedPumpId } = usePumpStore()
  const [weekStart, setWeekStart] = useState<string>(() => mondayOf(istDateString()))

  // Generate modal state
  const [showGenerate, setShowGenerate] = useState(false)
  const [genDayOps, setGenDayOps] = useState('2')
  const [genNightOps, setGenNightOps] = useState('1')
  const [genError, setGenError] = useState<string | null>(null)

  // Slot editor state
  const [editSlot, setEditSlot] = useState<{ date: string; shiftDefinitionId: number } | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [addOpId, setAddOpId] = useState<string>('')

  const pumpId = selectedPumpId

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn: () => userApi.getStaff(pumpId!),
    enabled: !!pumpId,
  })
  const operatorStaff = staff.filter(s => s.role === 'OPERATOR' && s.status === 'ACTIVE')
  const staffById = Object.fromEntries(operatorStaff.map(s => [s.id, s]))

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['shiftPlan', pumpId, weekStart],
    queryFn: () => shiftPlanApi.getPlan(pumpId!, weekStart),
    enabled: !!pumpId,
    retry: false,
  })

  const { data: entries = [] } = useQuery({
    queryKey: ['shiftPlanEntries', plan?.id],
    queryFn: () => shiftPlanApi.getEntries(pumpId!, plan!.id),
    enabled: !!plan?.id,
  })

  // Last day of the displayed week (weekStart + 6 days)
  const weekEnd = addDays(weekStart, 6)

  const { data: actualAttendance = [] } = useQuery({
    queryKey: ['actualAttendance', pumpId, weekStart],
    queryFn: () => shiftPlanApi.getActualAttendance(pumpId!, weekStart, weekEnd),
    enabled: !!pumpId && canSeeAttendance,
    refetchInterval: 60_000, // refresh every 60s so today's shifts reflect live status
  })

  const { data: shiftDefinitions = [] } = useQuery({
    queryKey: ['shift-definitions-active', pumpId],
    queryFn: () => shiftDefinitionApi.getActive(pumpId!),
    enabled: !!pumpId,
  })
  const sortedDefs = [...shiftDefinitions].sort((a, b) => a.sortOrder - b.sortOrder)

  const invalidatePlan = () => {
    queryClient.invalidateQueries({ queryKey: ['shiftPlan', pumpId, weekStart] })
    queryClient.invalidateQueries({ queryKey: ['shiftPlanEntries', plan?.id] })
  }

  const generateMutation = useMutation({
    mutationFn: () => shiftPlanApi.generatePlan(pumpId!, weekStart, Number(genDayOps), Number(genNightOps)),
    onSuccess: () => { setShowGenerate(false); setGenError(null); invalidatePlan() },
    onError: (err) => setGenError(parseApiError(err, t('planning.errors.generateFailed'))),
  })

  const publishMutation = useMutation({
    mutationFn: () => shiftPlanApi.publishPlan(pumpId!, plan!.id),
    onSuccess: () => invalidatePlan(),
  })

  const removeEntryMutation = useMutation({
    mutationFn: ({ entryId }: { entryId: number }) =>
      shiftPlanApi.removeEntry(pumpId!, plan!.id, entryId),
    onSuccess: () => { invalidatePlan(); setSlotError(null) },
    onError: (err) => setSlotError(parseApiError(err, t('planning.errors.removeFailed'))),
  })

  const addEntryMutation = useMutation({
    mutationFn: ({ opId }: { opId: number }) =>
      shiftPlanApi.addEntry(pumpId!, plan!.id, editSlot!.date, editSlot!.shiftDefinitionId, opId),
    onSuccess: () => { setAddOpId(''); setSlotError(null); invalidatePlan() },
    onError: (err) => setSlotError(parseApiError(err, t('planning.errors.addFailed'))),
  })

  // Navigation
  const prevWeek = () => setWeekStart(addDays(weekStart, -7))
  const nextWeek = () => setWeekStart(addDays(weekStart, 7))

  // Build 7 day columns
  const days: string[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const today = istDateString()

  // The week is entirely in the past when its last day is before today
  const isWeekEntirelyPast = weekEnd < today

  // Build entry lookup: date → shiftDefinitionId → entries[]
  const entryMap: Record<string, Record<number, ShiftPlanEntry[]>> = {}
  for (const e of entries) {
    entryMap[e.shiftDate] ??= {}
    entryMap[e.shiftDate][e.shiftDefinitionId] ??= []
    entryMap[e.shiftDate][e.shiftDefinitionId].push(e)
  }

  // Build actual attendance lookup: date → shiftDefinitionId → distinct operatorUserIds[]
  const actualMap: Record<string, Record<number, number[]>> = {}
  for (const a of actualAttendance) {
    actualMap[a.shiftDate] ??= {}
    actualMap[a.shiftDate][a.shiftDefinitionId] ??= []
    if (!actualMap[a.shiftDate][a.shiftDefinitionId].includes(a.operatorUserId)) {
      actualMap[a.shiftDate][a.shiftDefinitionId].push(a.operatorUserId)
    }
  }

  const isEditingSlot = (date: string, shiftDefinitionId: number) =>
    editSlot?.date === date && editSlot?.shiftDefinitionId === shiftDefinitionId

  return {
    isOwnerOrAdmin,
    weekStart,
    showGenerate,
    setShowGenerate,
    genDayOps,
    setGenDayOps,
    genNightOps,
    setGenNightOps,
    genError,
    setGenError,
    setEditSlot,
    slotError,
    setSlotError,
    addOpId,
    setAddOpId,
    pumpId,
    operatorStaff,
    staffById,
    plan,
    planLoading,
    sortedDefs,
    generateMutation,
    publishMutation,
    removeEntryMutation,
    addEntryMutation,
    prevWeek,
    nextWeek,
    days,
    today,
    isWeekEntirelyPast,
    entryMap,
    actualMap,
    isEditingSlot,
  }
}

export type ShiftPlanning = ReturnType<typeof useShiftPlanning>
