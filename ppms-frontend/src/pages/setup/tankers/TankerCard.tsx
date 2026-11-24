import { Check, Pencil, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Tanker } from '../../../api/tankerApi'
import { ConfirmButton } from '../../../components/ConfirmButton'
import { StatusBadge } from '../../../components/StatusBadge'
import { codeLabel } from '../../../constants/labels'
import { formatNumberIn } from '../../../i18n/format'

interface Props {
  tanker: Tanker
  actionsDisabled: boolean
  onEdit: () => void
  onMakeDefault: () => void
  onRemove: () => void
}

/** One tanker: name, whole-litre capacity, own or company, whether it is the default, with its actions. */
export function TankerCard({ tanker, actionsDisabled, onEdit, onMakeDefault, onRemove }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  return (
    <article aria-label={tanker.name} className="ui-card-plain flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="ui-hub-card__icon"><Truck size={18} strokeWidth={2} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{tanker.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone="neutral" label={codeLabel(tanker.tankerType)} />
            {tanker.defaultTanker && <StatusBadge tone="ok" icon={Check} label={t('tankers.default')} />}
          </div>
        </div>
      </div>

      <div>
        <p className="ui-kpi-label">{t('tankers.capacity')}</p>
        <p className="text-xl font-semibold text-ink tabular-nums">
          {t('tankers.capacityLitres', { litres: formatNumberIn(tanker.capacityLitres, { maximumFractionDigits: 0 }) })}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {!tanker.defaultTanker && (
          <button type="button" onClick={onMakeDefault} disabled={actionsDisabled} className="ui-btn ui-btn-secondary ui-btn-compact">
            {t('tankers.setDefault')}
          </button>
        )}
        <button type="button" onClick={onEdit} aria-label={t('tankers.editAria', { name: tanker.name })} className="ui-btn ui-btn-ghost ui-btn-compact gap-1.5">
          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
          {t('common:actions.edit')}
        </button>
        <ConfirmButton
          onConfirm={onRemove}
          disabled={actionsDisabled}
          triggerLabel={t('tankers.remove')}
          triggerAriaLabel={t('tankers.removeAria', { name: tanker.name })}
          prompt={t('tankers.removePrompt')}
          triggerClassName="ui-btn ui-btn-ghost ui-btn-compact text-bad hover:bg-bad-bg"
        />
      </div>
    </article>
  )
}
