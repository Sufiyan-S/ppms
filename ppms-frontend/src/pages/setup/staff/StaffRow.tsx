import { useRef } from 'react'
import { CircleOff, Settings, CalendarDays, RotateCcw, Pencil } from 'lucide-react'
import type { StaffMember } from '../../../api/userApi'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { RowActionMenu } from '../../../components/RowActionMenu'
import type { RowActionMenuItem } from '../../../components/RowActionMenu'
import { useRowPanelFocus } from '../../../hooks/useRowPanelFocus'
import { ROLE_BADGE } from './staffForm'
import type { StaffPanel } from './staffForm'
import { EditStaffPanel } from './EditStaffPanel'
import { PreferencesPanel } from './PreferencesPanel'
import { PayRatesPanel } from './PayRatesPanel'
import { LeavePanel } from './LeavePanel'
import { codeLabel } from '../../../constants/labels'

interface Props {
  pumpId: number
  member: StaffMember
  isOwner: boolean
  isOwnerOrAdmin: boolean
  activeShiftDefs: ShiftDefinition[]
  openPanel: StaffPanel | null
  onOpenPanel: (panel: StaffPanel) => void
  onClosePanel: () => void
  menuOpen: boolean
  onMenuChange: (userId: number | null) => void
  statusPending: boolean
  onToggleStatus: () => void
}

export function StaffRow({
  pumpId, member, isOwner, isOwnerOrAdmin, activeShiftDefs, openPanel, onOpenPanel, onClosePanel,
  menuOpen, onMenuChange, statusPending, onToggleStatus,
}: Props) {
  const isInactive = member.status === 'INACTIVE'
  const isPrefOpen  = openPanel === 'preferences'
  const isLeaveOpen = openPanel === 'leave'
  const isOperator  = member.role === 'OPERATOR'
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useRowPanelFocus(openPanel, panelRef, menuButtonRef)
  const payRatesMissing = member.role === 'OPERATOR' ? member.shift1HourlyRate == null : member.dailyRate == null

  const menuItems: RowActionMenuItem[] = [
    { key: 'edit', label: 'Edit Details', description: 'Update name, phone number, or role', icon: <Pencil size={14} strokeWidth={2} />, className: 'text-slate-700 hover:bg-violet-50 hover:text-violet-700', onSelect: () => onOpenPanel('edit') },
    ...(isOwner && isOperator ? [{ key: 'preferences', label: 'Shift Preferences', description: 'Set preferred shift and weekly day off', icon: <Settings size={14} strokeWidth={2} />, className: 'text-slate-700 hover:bg-blue-50 hover:text-blue-700', onSelect: () => onOpenPanel('preferences') }] : []),
    ...(isOwner ? [
      { key: 'leave', label: 'Manage Leave', description: 'Add or remove leave dates for this staff member', icon: <CalendarDays size={14} strokeWidth={2} />, className: 'text-slate-700 hover:bg-amber-50 hover:text-amber-700', onSelect: () => onOpenPanel('leave') },
      { key: 'rates', label: payRatesMissing ? 'Pay Rates (not set)' : 'Pay Rates', description: 'Configure hourly or daily pay rates', icon: '₹', className: 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700', onSelect: () => onOpenPanel('rates') },
      {
        key: 'status',
        label: isInactive ? 'Activate Staff' : 'Deactivate Staff',
        description: isInactive ? 'Allow this staff member to work again' : 'Temporarily remove this staff member from active use',
        icon: isInactive ? <RotateCcw size={14} strokeWidth={2} /> : <CircleOff size={14} strokeWidth={2} />,
        className: isInactive ? 'text-emerald-700 hover:bg-emerald-50' : 'text-red-700 hover:bg-red-50',
        onSelect: onToggleStatus,
        disabled: statusPending,
      },
    ] : []),
  ]

  return (
    <div
      key={member.id}
      className={`ui-card-plain relative ${menuOpen ? 'z-20' : 'z-0'} ${isInactive ? 'border-slate-100 opacity-70' : 'border-slate-200'}`}
    >
      {/* Staff row */}
      <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
        <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
          ROLE_BADGE[member.role]?.replace('text-', 'bg-').replace('-700', '-200') ?? 'bg-slate-100'
        }`}>
          {member.fullName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-slate-800">{member.fullName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                {member.phoneNumber ? <span>{member.phoneNumber}</span> : null}
                {member.employeeId ? <span>{member.employeeId}</span> : null}
                {member.gender ? (
                  <span>{member.gender.charAt(0) + member.gender.slice(1).toLowerCase()}</span>
                ) : null}
                {member.role === 'OPERATOR' && member.gender === 'FEMALE' ? (
                  <span className={member.nightShiftConsent ? 'text-emerald-600' : 'text-amber-700'}>
                    {member.nightShiftConsent ? 'Night shift okay' : 'No night shift'}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-[0.08em] ${ROLE_BADGE[member.role] ?? 'bg-slate-100 text-slate-600'}`}>
                {codeLabel(member.role)}
              </span>
              {isInactive && (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-[0.08em] bg-red-100 text-red-600">Inactive</span>
              )}
            </div>
          </div>
        </div>
        {isOwnerOrAdmin && (
          <div className="md:ml-auto">
            <RowActionMenu
              label="Staff actions"
              open={menuOpen}
              onOpenChange={(open) => onMenuChange(open ? member.id : null)}
              triggerRef={menuButtonRef}
              triggerClassName="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg leading-none text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-800"
              menuClassName="absolute right-0 top-full z-[6] mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg backdrop-blur"
              items={menuItems}
            />
          </div>
        )}
      </div>

      <div ref={panelRef}>
      {/* Edit details panel */}
      {openPanel === 'edit' && (
        <EditStaffPanel pumpId={pumpId} member={member} isOwner={isOwner} onClose={onClosePanel} />
      )}

      {/* Preferences panel */}
      {isPrefOpen && (
        <PreferencesPanel pumpId={pumpId} member={member} activeShiftDefs={activeShiftDefs} onClose={onClosePanel} />
      )}

      {/* Pay Rates panel */}
      {openPanel === 'rates' && (
        <PayRatesPanel pumpId={pumpId} member={member} onClose={onClosePanel} />
      )}

      {/* Leave management panel */}
      {isLeaveOpen && (
        <LeavePanel pumpId={pumpId} member={member} onClose={onClosePanel} />
      )}
      </div>
    </div>
  )
}
