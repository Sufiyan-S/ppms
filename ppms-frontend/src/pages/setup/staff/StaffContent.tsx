import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import { useAuthStore } from '../../../store/authStore'
import type { PumpSummary } from '../../../api/pumpApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import { SkeletonRows } from '../../../components/Skeleton'
import type { StaffPanel } from './staffForm'
import { StaffRow } from './StaffRow'
import { StaffToolbar } from './StaffToolbar'
import { AddStaffForm } from './AddStaffForm'
import { filterStaff, NO_STAFF_FILTERS } from './staffList'
import { canPerformAction } from '../../../permissions/permissions'

/** Below this many people the whole list fits on a screen, so search and filters would only get in the way. */
const TOOLBAR_FROM_COUNT = 6

/** The add form shows while isAddFormOpen, and always while the pump has no staff yet. */
export function StaffContent({ pump, isAddFormOpen, onCloseAddForm }: { pump: PumpSummary; isAddFormOpen: boolean; onCloseAddForm: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const viewerRole = currentUser?.role
  const canAssignAdmin = canPerformAction('staff:create-admin', viewerRole)

  const [statusError, setStatusError] = useState<string | null>(null)
  const [filters, setFilters] = useState(NO_STAFF_FILTERS)

  // Only one staff member's panel or menu is open at a time.
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
    onError: (err) => setStatusError(parseApiError(err, t('staff.statusFailed'))),
  })

  const { data: activeShiftDefs = [] } = useQuery({
    queryKey: ['shift-definitions-active', pump.id],
    queryFn: () => shiftDefinitionApi.getActive(pump.id),
  })

  const openPanel = (userId: number, panel: StaffPanel) => {
    setOpenStaffMenu(null)
    setOpenStaffPanel(prev => prev?.userId === userId && prev?.panel === panel ? null : { userId, panel })
  }

  if (isLoading) return <SkeletonRows count={3} />

  const showToolbar = staff.length >= TOOLBAR_FROM_COUNT
  const shownStaff = showToolbar ? filterStaff(staff, filters) : staff
  const roles = [...new Set(staff.map((member) => member.role))]

  return (
    <div className="space-y-4">
      {isAddFormOpen && <AddStaffForm pumpId={pump.id} canAssignAdmin={canAssignAdmin} onCancel={onCloseAddForm} />}

      {staff.length === 0 && (
        <div className="flex items-start gap-3 rounded-card border border-dashed border-border bg-surface p-4">
          <span aria-hidden="true" className="ui-hub-card__icon"><Users size={18} strokeWidth={2} /></span>
          <div>
            <p className="text-sm font-semibold text-ink">{t('staff.empty.title')}</p>
            <p className="mt-0.5 text-xs text-ink-3">{t('staff.empty.body')}</p>
          </div>
        </div>
      )}

      {showToolbar && (
        <StaffToolbar roles={roles} filters={filters} onChange={setFilters} shownCount={shownStaff.length} totalCount={staff.length} />
      )}

      {statusError && <p role="alert" className="ui-error-text">{statusError}</p>}

      {staff.length > 0 && shownStaff.length === 0 && (
        <div className="ui-empty space-y-3">
          <p className="text-sm">{t('staff.filters.noMatch')}</p>
          <button type="button" onClick={() => setFilters(NO_STAFF_FILTERS)} className="ui-btn ui-btn-secondary ui-btn-compact">
            {t('common:actions.clearFilters')}
          </button>
        </div>
      )}

      {shownStaff.length > 0 && (
        <ul aria-label={t('staff.listLabel')} className="space-y-2">
          {shownStaff.map((member) => (
            <StaffRow
              key={member.id}
              pumpId={pump.id}
              member={member}
              viewerRole={viewerRole}
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
        </ul>
      )}

      {staff.length === 0 && !isAddFormOpen && <AddStaffForm pumpId={pump.id} canAssignAdmin={canAssignAdmin} />}
    </div>
  )
}
