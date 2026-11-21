import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { useAuthStore } from '../../../store/authStore'
import type { PumpSummary } from '../../../api/pumpApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { StaffPanel } from './staffForm'
import { StaffRow } from './StaffRow'
import { AddStaffForm } from './AddStaffForm'

export function StaffContent({ pump }: { pump: PumpSummary }) {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const isOwner = currentUser?.role === 'OWNER'
  const isOwnerOrAdmin = isOwner || currentUser?.role === 'ADMIN'

  const [statusError, setStatusError] = useState<string | null>(null)

  // Preferences / leave / pay-rates / edit panel — only one staff member open at a time
  const [openStaffPanel, setOpenStaffPanel] = useState<{ userId: number; panel: StaffPanel } | null>(null)
  const [openStaffMenu, setOpenStaffMenu] = useState<number | null>(null)

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', pump.id],
    queryFn:  () => userApi.getStaff(pump.id),
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      userApi.updateUserStatus(userId, status),
    onSuccess: () => {
      setStatusError(null)
      queryClient.invalidateQueries({ queryKey: ['staff', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['operators', pump.id] })
    },
    onError: (err) => setStatusError(parseApiError(err, 'Failed to update status')),
  })

  const { data: activeShiftDefs = [] } = useQuery({
    queryKey: ['shift-definitions-active', pump.id],
    queryFn: () => shiftDefinitionApi.getActive(pump.id),
  })

  const openPanel = (userId: number, panel: StaffPanel) => {
    setOpenStaffMenu(null)
    setOpenStaffPanel(prev => prev?.userId === userId && prev?.panel === panel ? null : { userId, panel })
  }

  return (
    <div className="space-y-4">

      {/* Staff list */}
      {!isLoading && staff.length > 0 && (
        <div className="space-y-2">
          {statusError && <p role="alert" className="ui-error-text">{statusError}</p>}
          {staff.map((member: StaffMember) => (
            <StaffRow
              key={member.id}
              pumpId={pump.id}
              member={member}
              isOwner={isOwner}
              isOwnerOrAdmin={isOwnerOrAdmin}
              activeShiftDefs={activeShiftDefs}
              openPanel={openStaffPanel?.userId === member.id ? openStaffPanel.panel : null}
              onOpenPanel={(panel) => openPanel(member.id, panel)}
              onClosePanel={() => setOpenStaffPanel(null)}
              menuOpen={openStaffMenu === member.id}
              onMenuChange={setOpenStaffMenu}
              statusPending={statusMutation.isPending}
              onToggleStatus={() => statusMutation.mutate({ userId: member.id, status: member.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' })}
            />
          ))}
        </div>
      )}

      {/* Add staff form */}
      <AddStaffForm pumpId={pump.id} />
    </div>
  )
}
