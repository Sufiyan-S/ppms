import { useTranslation } from 'react-i18next'

interface ClientActionsProps {
  canManageInterest: boolean
  canApplyInterest: boolean
  isApplyingInterest: boolean
  canGrantExtension: boolean
  canRecordPayment: boolean
  onOpenInterestSettings: () => void
  onApplyInterest: () => void
  onGrantExtension: () => void
  onRecordPayment: () => void
  onOpenStatement: () => void
}

export function ClientActions({
  canManageInterest, canApplyInterest, isApplyingInterest, canGrantExtension, canRecordPayment,
  onOpenInterestSettings, onApplyInterest, onGrantExtension, onRecordPayment, onOpenStatement,
}: ClientActionsProps) {
  const { t } = useTranslation('credit')
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={onOpenStatement} className="ui-btn ui-btn-secondary">
        {t('clientActions.statement')}
      </button>
      {canManageInterest && (
        <button onClick={onOpenInterestSettings} className="ui-btn ui-btn-secondary text-info border-info/30 hover:bg-info-bg">
          {t('clientActions.interestSettings')}
        </button>
      )}
      {canApplyInterest && (
        <button onClick={onApplyInterest} disabled={isApplyingInterest}
          className="ui-btn ui-btn-secondary">
          {isApplyingInterest ? t('clientActions.applyingInterest') : t('clientActions.applyInterest')}
        </button>
      )}
      {canGrantExtension && (
        <button onClick={onGrantExtension} className="ui-btn ui-btn-secondary text-info border-info/30 hover:bg-info-bg">
          {t('clientActions.grantExtension')}
        </button>
      )}
      {canRecordPayment && (
        <button onClick={onRecordPayment} className="ui-btn ui-btn-primary">
          {t('clientActions.recordPayment')}
        </button>
      )}
    </div>
  )
}
