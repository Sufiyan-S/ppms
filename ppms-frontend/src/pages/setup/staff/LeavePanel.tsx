import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { parseApiError } from '../../../utils/apiError'
import { shiftPlanApi } from '../../../api/shiftPlanApi'
import type { StaffMember } from '../../../api/userApi'
import { formatIstDate } from '../../../utils/date'
import { IconButton } from '../../../components/IconButton'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { RowPanel, RowPanelActions } from './RowPanel'

interface Props {
  pumpId: number
  member: StaffMember
  onClose: () => void
}

export function LeavePanel({ pumpId, member, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const stillNeededId = useId()
  const [newLeaveDate, setNewLeaveDate] = useState('')
  const [newLeaveReason, setNewLeaveReason] = useState('')
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const { data: openLeaves = [] } = useQuery({
    queryKey: ['staffLeaves', pumpId, member.id],
    queryFn: () => shiftPlanApi.getLeaves(pumpId, member.id),
  })

  const addLeaveMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      shiftPlanApi.addLeave(pumpId, userId, newLeaveDate, newLeaveReason || undefined),
    onSuccess: () => {
      setNewLeaveDate(''); setNewLeaveReason(''); setLeaveError(null)
      queryClient.invalidateQueries({ queryKey: ['staffLeaves', pumpId, member.id] })
    },
    onError: (err) => setLeaveError(parseApiError(err, t('staff.leave.failed'))),
  })

  const removeLeaveMutation = useMutation({
    mutationFn: ({ leaveId }: { leaveId: number }) =>
      shiftPlanApi.removeLeave(pumpId, member.id, leaveId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['staffLeaves', pumpId, member.id] }),
  })

  const stillNeeded = newLeaveDate ? [] : [t('staff.leave.date')]

  return (
    <RowPanel title={t('staff.leave.title', { name: member.fullName })}>
      {openLeaves.length === 0 ? (
        <p className="text-xs text-ink-3">{t('staff.leave.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {openLeaves.map(lv => (
            <li key={lv.id} className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{formatIstDate(lv.leaveDate)}</span>
              {lv.reason && <span className="text-xs text-ink-3">— {lv.reason}</span>}
              <IconButton
                onClick={() => removeLeaveMutation.mutate({ leaveId: lv.id })}
                disabled={removeLeaveMutation.isPending}
                className="ui-btn ui-btn-ghost ml-auto text-ink-3 disabled:opacity-40"
                label={t('staff.leave.remove')}
                icon={<X size={12} strokeWidth={2} />}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <FormGrid>
          <FormField label={t('staff.leave.date')}>
            <input type="date" value={newLeaveDate} onChange={e => setNewLeaveDate(e.target.value)} className="text-sm" />
          </FormField>
          <FormField label={<>{t('staff.leave.reason')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}>
            <input type="text" value={newLeaveReason} onChange={e => setNewLeaveReason(e.target.value)} className="text-sm" />
          </FormField>
        </FormGrid>
        {leaveError && <p role="alert" className="ui-error-text">{leaveError}</p>}
        <RowPanelActions>
          <LoadingButton
            type="button"
            isLoading={addLeaveMutation.isPending}
            loadingLabel={t('actions.adding')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            onClick={() => addLeaveMutation.mutate({ userId: member.id })}
            className="ui-btn-primary ui-btn-compact"
          >
            {t('staff.leave.submit')}
          </LoadingButton>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
            {t('common:actions.done')}
          </button>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
        </RowPanelActions>
      </div>
    </RowPanel>
  )
}
