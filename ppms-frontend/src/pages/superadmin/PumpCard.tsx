import { useState } from 'react'
import { AlertTriangle, Check, Fuel, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { StatusBadge } from '../../components/StatusBadge'
import { EditPumpForm } from './EditPumpForm'

interface PumpCardProps {
  pump: PumpSummary
  isEditOpen: boolean
  onToggleEdit: () => void
  onToggleEnabled: () => void
  isSaving: boolean
  /** The last failed save or enable/disable of this pump. */
  error: string | null
  onSaveEdit: (data: UpdatePumpRequest) => void
}

export function PumpCard({ pump, isEditOpen, onToggleEdit, onToggleEnabled, isSaving, error, onSaveEdit }: PumpCardProps) {
  const { t } = useTranslation(['superadmin', 'common'])
  const [isConfirmingDisable, setIsConfirmingDisable] = useState(false)
  const showActions = !isEditOpen && !isConfirmingDisable

  const confirmDisable = () => {
    setIsConfirmingDisable(false)
    onToggleEnabled()
  }

  return (
    <div className={`rounded-control border p-2.5 ${pump.enabled ? 'border-border bg-bg' : 'border-border bg-surface-sunken'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 text-xs min-w-0">
          <Fuel size={12} strokeWidth={1.8} className="text-ink-3 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-semibold ${!pump.enabled ? 'text-ink-3' : 'text-ink'}`}>
                {pump.pumpName}
              </span>
              {!pump.enabled && (
                <StatusBadge tone="bad" label={t('pump.disabled')} />
              )}
            </div>
            <p className="text-ink-3 mt-0.5">{pump.pumpAddress}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <StatusBadge tone="neutral" icon={Users} label={t('pump.staff', { value: pump.staffCount })} />
              <StatusBadge
                tone={pump.setupDoneCount === pump.setupRequiredCount ? 'ok' : 'warn'}
                icon={pump.setupDoneCount === pump.setupRequiredCount ? Check : AlertTriangle}
                label={t('pump.setup', { done: pump.setupDoneCount, required: pump.setupRequiredCount })}
              />
            </div>
          </div>
        </div>
        {showActions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={onToggleEdit} className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('common:actions.edit')}
            </button>
            <button
              type="button"
              onClick={pump.enabled ? () => setIsConfirmingDisable(true) : onToggleEnabled}
              disabled={isSaving}
              className="ui-btn ui-btn-secondary ui-btn-compact"
            >
              {pump.enabled ? t('common:actions.disable') : t('common:actions.enable')}
            </button>
          </div>
        )}
      </div>

      {isConfirmingDisable && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-sm font-semibold text-ink">{t('pump.disableTitle', { name: pump.pumpName })}</p>
          <p className="text-xs text-ink-3">{t('pump.disableConsequence')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setIsConfirmingDisable(false)} className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('common:actions.cancel')}
            </button>
            <button type="button" onClick={confirmDisable} disabled={isSaving} className="ui-btn ui-btn-danger ui-btn-compact">
              {t('pump.disableConfirm')}
            </button>
          </div>
        </div>
      )}

      {isEditOpen ? (
        <EditPumpForm pump={pump} isSaving={isSaving} error={error} onSave={onSaveEdit} onCancel={onToggleEdit} />
      ) : error && (
        <p role="alert" className="ui-error-text">{error}</p>
      )}
    </div>
  )
}
