import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { parseApiError } from '../../../utils/apiError'
import { shiftPlanApi } from '../../../api/shiftPlanApi'
import type { StaffMember } from '../../../api/userApi'
import { formatIstDate } from '../../../utils/date'
import { IconButton } from '../../../components/IconButton'

interface Props {
  pumpId: number
  member: StaffMember
  onClose: () => void
}

export function LeavePanel({ pumpId, member, onClose }: Props) {
  const queryClient = useQueryClient()
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
    onError: (err) => setLeaveError(parseApiError(err, 'Failed to add leave')),
  })

  const removeLeaveMutation = useMutation({
    mutationFn: ({ leaveId }: { leaveId: number }) =>
      shiftPlanApi.removeLeave(pumpId, member.id, leaveId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['staffLeaves', pumpId, member.id] }),
  })

  return (
    <div className="px-3 py-3 border-t border-slate-100">
      <div className="max-w-sm space-y-3">
        <p className="text-xs font-semibold text-slate-700">Leave dates for {member.fullName}</p>
        {openLeaves.length === 0 ? (
          <p className="text-xs text-slate-500">No leave dates recorded.</p>
        ) : (
          <div className="space-y-1">
            {openLeaves.map(lv => (
              <div key={lv.id} className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {formatIstDate(lv.leaveDate)}
                </span>
                {lv.reason && <span className="text-xs text-slate-500">— {lv.reason}</span>}
                <IconButton
                  onClick={() => removeLeaveMutation.mutate({ leaveId: lv.id })}
                  disabled={removeLeaveMutation.isPending}
                  className="ui-btn ui-btn-ghost ml-auto text-slate-500 hover:text-red-500 disabled:opacity-40"
                  label="Remove leave"
                  icon={<X size={12} strokeWidth={2} />}
                />
              </div>
            ))}
          </div>
        )}
        {/* Add new leave */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <p className="ui-label mb-0">Add leave date</p>
          <input aria-label="Leave date"
            type="date"
            value={newLeaveDate}
            onChange={e => setNewLeaveDate(e.target.value)}
            className="text-xs min-h-10"
          />
          <input aria-label="Leave reason"
            type="text"
            placeholder="Reason (optional)"
            value={newLeaveReason}
            onChange={e => setNewLeaveReason(e.target.value)}
            className="text-xs min-h-10"
          />
          {leaveError && <p role="alert" className="ui-error-text">{leaveError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!newLeaveDate || addLeaveMutation.isPending}
              onClick={() => addLeaveMutation.mutate({ userId: member.id })}
              className="ui-btn ui-btn-primary ui-btn-compact"
            >
              {addLeaveMutation.isPending ? 'Adding…' : 'Add Leave'}
            </button>
            <button type="button" onClick={onClose}
              className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
