import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { PlanningStatusMark } from './PlanningStatusMark'
import type { ShiftPlanning } from './useShiftPlanning'

interface PlanningSlotCellProps {
  form: ShiftPlanning
  day: string
  shiftDefinitionId: number
}

/** Who worked a past slot (and who was planned but absent), or who is planned for a coming one with add and remove controls. */
export function PlanningSlotCell({ form, day, shiftDefinitionId }: PlanningSlotCellProps) {
  const { t } = useTranslation(['shifts', 'common'])
  const { isOwnerOrAdmin, setEditSlot, slotError, setSlotError, addOpId, setAddOpId, operatorStaff, staffById, plan, removeEntryMutation, addEntryMutation, today, entryMap, actualMap, isEditingSlot } = form
  const slotEntries = entryMap[day]?.[shiftDefinitionId] ?? []
  const actualOpIds = actualMap[day]?.[shiftDefinitionId] ?? []
  // Show actual attendance for past days, or for today's slots where a shift has already started
  const isPast = day < today || (day === today && actualOpIds.length > 0)
  const isEditing = isEditingSlot(day, shiftDefinitionId)
  const nameOf = (operatorId: number) => staffById[operatorId]?.fullName ?? `#${operatorId}`

  if (isPast) {
    const absentEntries = slotEntries.filter(entry => !actualOpIds.includes(entry.operatorUserId))
    return (
      <td className="ui-plan-day-cell opacity-80">
        <div className="space-y-1">
          {actualOpIds.length === 0 && absentEntries.length === 0 && (
            <span className="text-ink-3 text-xs italic">{t('planning.grid.noShift')}</span>
          )}
          {actualOpIds.map(opId => (
            <div key={opId} className="flex min-h-5 items-center gap-1">
              <span className="truncate text-ink-2 font-medium">{nameOf(opId)}</span>
              <PlanningStatusMark status="CONFIRMED" />
            </div>
          ))}
          {absentEntries.map(entry => (
            <div key={`absent-${entry.id}`} className="flex min-h-5 items-center gap-1">
              <span className="truncate text-ink-3 font-medium">{nameOf(entry.operatorUserId)}</span>
              <PlanningStatusMark status="ABSENT" />
            </div>
          ))}
        </div>
      </td>
    )
  }

  const availableToAdd = operatorStaff.filter(staff => !slotEntries.some(entry => entry.operatorUserId === staff.id))
  return (
    <td className="ui-plan-day-cell">
      <div className="space-y-1">
        {slotEntries.map(entry => (
          <div key={entry.id} className="ui-plan-entry flex min-h-5 items-center gap-1">
            <span className="truncate text-ink font-medium">{nameOf(entry.operatorUserId)}</span>
            <PlanningStatusMark status={entry.status} />
            {isOwnerOrAdmin && entry.status === 'PLANNED' && (
              <IconButton
                onClick={() => removeEntryMutation.mutate({ entryId: entry.id })}
                disabled={removeEntryMutation.isPending}
                className="ui-plan-entry__remove ml-0.5 shrink-0 text-ink-3 hover:text-bad"
                label={t('planning.grid.removeFromPlan')}
                icon={<X size={11} strokeWidth={2} />}
              />
            )}
          </div>
        ))}

        {isOwnerOrAdmin && plan && !isEditing && (
          <button
            type="button"
            onClick={() => { setEditSlot({ date: day, shiftDefinitionId }); setSlotError(null); setAddOpId('') }}
            className="ui-btn ui-btn-ghost ui-btn-compact px-2"
            aria-label={t('planning.grid.addOperator')}
          >
            <Plus size={12} strokeWidth={2.5} aria-hidden="true" />
            {t('common:actions.add')}
          </button>
        )}

        {isEditing && (
          <div className="mt-1 space-y-1">
            <SearchableSelect label={t('planning.grid.operatorToAdd')}
              value={addOpId}
              onChange={v => setAddOpId(v)}
              placeholder={t('planning.grid.pickOperator')}
              size="sm"
              options={availableToAdd.map(staff => ({ value: staff.id.toString(), label: staff.fullName }))}
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => addOpId && addEntryMutation.mutate({ opId: Number(addOpId) })}
                disabled={!addOpId || addEntryMutation.isPending}
                className="ui-btn ui-btn-primary min-h-0 px-2 py-1 text-xs disabled:opacity-60"
              >
                {t('common:actions.add')}
              </button>
              <IconButton
                onClick={() => { setEditSlot(null); setSlotError(null) }}
                className="ui-btn ui-btn-secondary px-2 py-1 text-xs"
                label={t('common:actions.cancel')}
                icon={<X size={12} strokeWidth={2} />}
              />
            </div>
            {slotError && <p role="alert" className="ui-error-text">{slotError}</p>}
          </div>
        )}
      </div>
    </td>
  )
}
