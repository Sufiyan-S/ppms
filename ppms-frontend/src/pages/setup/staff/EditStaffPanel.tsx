import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { StaffMember, UpdateStaffDetailsRequest, UserGender } from '../../../api/userApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'

interface Props {
  pumpId: number
  member: StaffMember
  isOwner: boolean
  onClose: () => void
}

export function EditStaffPanel({ pumpId, member, isOwner, onClose }: Props) {
  const queryClient = useQueryClient()
  const [editFullName, setEditFullName]               = useState(member.fullName)
  const [editPhone, setEditPhone]                     = useState(member.phoneNumber ?? '')
  const [editRole, setEditRole]                       = useState<string>(member.role)
  const [editGender, setEditGender]                   = useState<UserGender | ''>((member.gender as UserGender | null) ?? '')
  const [editNightShiftConsent, setEditNightShiftConsent] = useState(member.nightShiftConsent)
  const [editError, setEditError]                     = useState<string | null>(null)

  const detailsMutation = useMutation({
    mutationFn: ({ userId, req }: { userId: number; req: UpdateStaffDetailsRequest }) =>
      userApi.updateStaffDetails(userId, req),
    onSuccess: () => {
      setEditError(null)
      onClose()
      queryClient.invalidateQueries({ queryKey: ['staff', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['operators', pumpId] })
    },
    onError: (err) => setEditError(parseApiError(err, 'Failed to save details')),
  })

  return (
    <div className="border-t border-violet-100 bg-violet-50/30 px-4 py-4">
      {/* Panel header */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
          <Pencil size={13} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Edit Staff Details</p>
          <p className="text-[11px] text-slate-500">Changes are saved when you click Save Changes</p>
        </div>
      </div>

      <div className="max-w-md space-y-3">
        {/* Row 1: Name + Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block">
              <span className="ui-label">Full Name</span>
              <input
                type="text"
                value={editFullName}
                onChange={e => setEditFullName(e.target.value)}
                placeholder="Full name"
                className="text-sm"
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="ui-label">Phone Number</span>
              <input
                type="text"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="10-digit number"
                maxLength={10}
                className="text-sm"
              />
            </label>
          </div>
        </div>

        {/* Row 2: Role + Gender */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="ui-label">Role</span>
            <SearchableSelect label="Role"
              value={editRole}
              onChange={v => {
                setEditRole(v)
                if (v !== 'OPERATOR') setEditNightShiftConsent(false)
              }}
              placeholder="Select role"
              size="sm"
              options={[
                { value: 'OPERATOR',   label: 'Operator' },
                { value: 'MANAGER',    label: 'Manager' },
                ...(isOwner ? [{ value: 'ADMIN', label: 'Admin' }] : []),
                { value: 'ACCOUNTANT', label: 'Accountant' },
              ]}
            />
          </div>
          <div>
            <span className="ui-label">Gender</span>
            <SearchableSelect label="Gender"
              value={editGender}
              onChange={v => {
                setEditGender(v as UserGender | '')
                if (v !== 'FEMALE') setEditNightShiftConsent(false)
              }}
              placeholder="Select gender"
              size="sm"
              options={[
                { value: 'MALE',   label: 'Male' },
                { value: 'FEMALE', label: 'Female' },
                { value: 'OTHER',  label: 'Other' },
              ]}
            />
          </div>
        </div>

        {/* Night shift consent — only for female operators */}
        {editRole === 'OPERATOR' && editGender === 'FEMALE' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={editNightShiftConsent}
              onChange={e => setEditNightShiftConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-600"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-amber-900">Okay for night shift</span>
              <span className="mt-1 block text-xs leading-5 text-amber-800">
                If left unchecked, shift planning will skip night-shift assignment for this operator.
              </span>
            </span>
          </label>
        )}

        {editError && <p role="alert" className="ui-error-text">{editError}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={detailsMutation.isPending || !editFullName.trim() || !editPhone.trim() || !editRole}
            onClick={() => detailsMutation.mutate({
              userId: member.id,
              req: {
                fullName: editFullName.trim(),
                phoneNumber: editPhone.trim(),
                role: editRole as UpdateStaffDetailsRequest['role'],
                gender: editGender || undefined,
                nightShiftConsent: editRole === 'OPERATOR' && editGender === 'FEMALE'
                  ? editNightShiftConsent
                  : false,
              },
            })}
            className="ui-btn ui-btn-primary min-h-0 px-4 py-2 text-sm"
          >
            {detailsMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" />Saving…</span> : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-secondary min-h-0 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
