import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Plus } from 'lucide-react'
import { superAdminApi } from '../../api/superAdminApi'
import type { OwnerSummary, PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { ResetPasswordDialog } from '../../components/ResetPasswordDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { formatIstDate } from '../../utils/date'
import { parseApiError } from '../../utils/apiError'
import { AddPumpForm } from './AddPumpForm'
import { PumpCard } from './PumpCard'
import { ownerStatusLabel } from './ownerStatus'

/** One owner: who they are, their pumps with setup progress, and the actions on them. */
export function OwnerDetail({ owner }: { owner: OwnerSummary }) {
  const { t } = useTranslation(['superadmin', 'common'])
  const queryClient = useQueryClient()
  const [isAddPumpOpen, setIsAddPumpOpen] = useState(false)
  const [editingPumpId, setEditingPumpId] = useState<number | null>(null)
  const [pumpError, setPumpError] = useState<{ pumpId: number; message: string } | null>(null)
  const [isResetOpen, setIsResetOpen] = useState(false)

  const editPumpMutation = useMutation({
    mutationFn: ({ pumpId, data }: { pumpId: number; data: UpdatePumpRequest }) =>
      superAdminApi.updatePump(pumpId, data),
    onSuccess: () => {
      setEditingPumpId(null)
      setPumpError(null)
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
    },
    onError: (err, { pumpId }) => setPumpError({ pumpId, message: parseApiError(err, t('owners.updatePumpFailed')) }),
  })

  const toggleEditPump = (pump: PumpSummary) => {
    setEditingPumpId(editingPumpId === pump.pumpId ? null : pump.pumpId)
    setPumpError(null)
  }

  const togglePumpEnabled = (pump: PumpSummary) => {
    setPumpError(null)
    editPumpMutation.mutate({
      pumpId: pump.pumpId,
      data: { pumpName: pump.pumpName, pumpAddress: pump.pumpAddress, enabled: !pump.enabled },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{owner.fullName}</h3>
            <StatusBadge tone={owner.status === 'ACTIVE' ? 'ok' : 'neutral'} label={ownerStatusLabel(t, owner.status)} />
          </div>
          <p className="mt-0.5 font-mono text-xs text-ink-3">{owner.phoneNumber}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
            <span>{t('owners.idLabel')} <span className="font-mono">{owner.employeeId}</span></span>
            <span>{t('owners.joined', { date: formatIstDate(owner.createdAt) })}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setIsResetOpen(true)} className="ui-btn ui-btn-secondary ui-btn-compact inline-flex items-center gap-1">
            <KeyRound size={12} strokeWidth={2} aria-hidden="true" />{t('owners.resetPassword')}
          </button>
          {!isAddPumpOpen && (
            <button
              type="button"
              onClick={() => setIsAddPumpOpen(true)}
              className="ui-btn ui-btn-secondary ui-btn-compact inline-flex items-center gap-1"
            >
              <Plus size={12} strokeWidth={2.5} aria-hidden="true" />{t('owners.addPump')}
            </button>
          )}
        </div>
      </div>

      {isAddPumpOpen && <AddPumpForm owner={owner} onDone={() => setIsAddPumpOpen(false)} />}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ink">{t('owners.pumpsTitle')}</h4>
        {owner.pumps.length === 0 ? (
          <p className="ui-help">{t('owners.noPumps')}</p>
        ) : (
          owner.pumps.map((pump) => (
            <PumpCard
              key={pump.pumpId}
              pump={pump}
              isEditOpen={editingPumpId === pump.pumpId}
              onToggleEdit={() => toggleEditPump(pump)}
              onToggleEnabled={() => togglePumpEnabled(pump)}
              isSaving={editPumpMutation.isPending}
              error={pumpError?.pumpId === pump.pumpId ? pumpError.message : null}
              onSaveEdit={(data) => {
                setPumpError(null)
                editPumpMutation.mutate({ pumpId: pump.pumpId, data })
              }}
            />
          ))
        )}
      </div>

      {isResetOpen && (
        <ResetPasswordDialog userId={owner.ownerId} userName={owner.fullName} onClose={() => setIsResetOpen(false)} />
      )}
    </div>
  )
}
