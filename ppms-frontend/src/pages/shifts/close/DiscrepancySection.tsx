import { ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fmt } from '../components/creditRow'

interface Props {
  diff: number
  canRoundOff: boolean
  onRoundOff: () => void
  reason: string
  onReasonChange: (reason: string) => void
}

export function DiscrepancySection({ diff, canRoundOff, onRoundOff, reason, onReasonChange }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  return (
    <div className={`border-2 rounded-card overflow-hidden ${diff < 0 ? 'border-bad' : 'border-warn'}`}>
      <div className={`px-4 py-3 flex items-start justify-between gap-3 ${diff < 0 ? 'bg-bad-bg' : 'bg-warn-bg'}`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-on-primary text-sm font-bold
 ${diff < 0 ? 'bg-bad' : 'bg-warn'}`}>
            !
          </div>
          <div>
            <p className={`text-sm font-semibold ${diff < 0 ? 'text-bad' : 'text-warn'}`}>
              {diff < 0 ? t('close.discrepancy.short', { amount: fmt(Math.abs(diff)) }) : t('close.discrepancy.excess', { amount: fmt(diff) })}
            </p>
            <p className="text-xs text-ink-3 mt-0.5">
              {diff < 0 ? t('close.discrepancy.collectedLess') : t('close.discrepancy.collectedMore')}
              {' '}{canRoundOff ? t('close.discrepancy.roundOffOrReason') : t('close.discrepancy.reasonToClose')}
            </p>
          </div>
        </div>
        {canRoundOff && (
          <button
            type="button"
            onClick={onRoundOff}
            className="ui-btn ui-btn-secondary ui-btn-compact shrink-0"
            title={t('close.discrepancy.roundOffTitle', { amount: fmt(Math.abs(diff)) })}
          >
            {t('close.discrepancy.roundOff', { amount: fmt(Math.abs(diff)) })}
          </button>
        )}
      </div>
      <div className="px-4 py-3 bg-surface">
        <label className="block">
          <span className="block text-xs font-semibold text-ink-2 mb-1.5">
          {t('common:fields.reason')}
          <span className="text-ink-3 font-normal ml-1">{t('close.discrepancy.requiredToClose')}</span>
        </span>
          <textarea value={reason} onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            placeholder={t('close.discrepancy.placeholder')}
            className={`w-full border rounded-control px-3 py-2 text-sm resize-none ${
              reason.trim().length > 0 ? 'border-ok' : 'border-control'
            }`}
          />
        </label>
        {reason.trim().length === 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-warn mt-1"><ArrowUp size={11} strokeWidth={2} />{t('close.discrepancy.enterReason')}</p>
        )}
      </div>
    </div>
  )
}
