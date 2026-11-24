import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Plus } from 'lucide-react'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { SkeletonRows } from '../../../components/Skeleton'
import { withToggled } from '../../../utils/setToggle'
import { CreateShiftBatchForm } from './CreateShiftBatchForm'
import { ShiftScheduleCard } from './ShiftScheduleCard'
import { groupSchedules } from './shiftScheduleGroups'

export function ShiftDefinitionsContent({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['setup', 'common'])
  const [showForm, setShowForm] = useState(false)

  const { data: allDefs = [], isLoading } = useQuery({
    queryKey: ['shift-definitions', pumpId],
    queryFn: () => shiftDefinitionApi.getAll(pumpId),
  })
  const schedules = groupSchedules(allDefs)

  // Disabled schedules start collapsed, once the list first loads.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [collapsedInitialized, setCollapsedInitialized] = useState(false)
  if (!collapsedInitialized && schedules.length > 0) {
    setCollapsedKeys(new Set(schedules.filter((schedule) => !schedule.isActive).map((schedule) => schedule.key)))
    setCollapsedInitialized(true)
  }

  if (isLoading) return <SkeletonRows count={3} />

  return (
    <div className="space-y-4">
      {schedules.length === 0 && !showForm && (
        <div className="flex items-start gap-3 rounded-card border border-dashed border-border bg-surface p-4">
          <span aria-hidden="true" className="ui-hub-card__icon"><CalendarClock size={18} strokeWidth={2} /></span>
          <p className="text-sm text-ink-2">{t('shiftDefs.empty')}</p>
        </div>
      )}

      {schedules.map((schedule) => (
        <ShiftScheduleCard
          key={schedule.key}
          pumpId={pumpId}
          schedule={schedule}
          isCollapsed={collapsedKeys.has(schedule.key)}
          onToggleCollapsed={() => setCollapsedKeys((prev) => withToggled(prev, schedule.key))}
        />
      ))}

      {showForm ? (
        <CreateShiftBatchForm pumpId={pumpId} onClose={() => setShowForm(false)} />
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="ui-btn ui-btn-secondary gap-1.5">
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          {t('shiftDefs.addSchedule')}
        </button>
      )}
    </div>
  )
}
