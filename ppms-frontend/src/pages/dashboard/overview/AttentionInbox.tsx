import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, BarChart2, CheckCircle2, ClipboardCheck, Clock, CreditCard, FileText, Fuel, Gauge, Landmark,
  Search, Settings, Wrench, ZapOff, type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { attentionApi } from '../../../api/attentionApi'
import type { AttentionItem, AttentionSeverity, AttentionType } from '../../../api/attentionApi'
import { SkeletonRows } from '../../../components/Skeleton'
import { PageSection } from '../../../components/layout/PageSection'
import { usePumpStore } from '../../../store/usePumpStore'
import { MoneyText } from '../../../components/AmountText'
import { serverText } from '../../../utils/serverText'

const ICON_BY_TYPE: Record<AttentionType, LucideIcon> = {
  PENDING_APPROVALS: ClipboardCheck,
  ESCALATED_SHORTAGES: AlertTriangle,
  LONG_INVESTIGATIONS: Search,
  OVERDUE_CREDIT: CreditCard,
  OVER_LIMIT_CREDIT: Gauge,
  UNSETTLED_PAYMENTS: Landmark,
  BALANCE_SHEETS: BarChart2,
  OVERDUE_SHIFTS: Clock,
  AUTO_CLOSED_SHIFTS: ZapOff,
  EXPIRING_DOCUMENTS: FileText,
  CALIBRATIONS_DUE: Wrench,
  STALE_FUEL_PRICES: Fuel,
  SETUP_INCOMPLETE: Settings,
}

const SEVERITY_CHIP: Record<AttentionSeverity, string> = {
  HIGH:   'bg-bad-bg text-bad',
  MEDIUM: 'bg-warn-bg text-warn',
  LOW:    'bg-info-bg text-info',
}

function AttentionRow({ item, showPumpName }: { item: AttentionItem; showPumpName: boolean }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const navigate = useNavigate()
  const { selectedPumpId, setSelectedPumpId } = usePumpStore()
  const Icon = ICON_BY_TYPE[item.type]
  const reason = serverText(item.reasonCode, item.reasonParams, item.reason)
  const actionLabel = showPumpName
    ? t('attention.reviewLabelWithPump', { pump: item.pumpName, reason })
    : t('attention.reviewLabel', { reason })

  // The target pages show the selected pump, so an item from another pump switches to it first
  const openOtherPump = () => {
    setSelectedPumpId(item.pumpId)
    navigate(item.targetPath)
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${SEVERITY_CHIP[item.severity]}`} aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-ink">
          <span className="sr-only">{t('attention.severityPrefix', { severity: t(`attention.severity.${item.severity}`) })}</span>
          {reason}
        </p>
        <p className="text-xs text-ink-3">
          {showPumpName && <span>{item.pumpName} · </span>}
          {item.severity === 'HIGH' && <span className="font-semibold text-bad" aria-hidden="true">{t('attention.urgentPrefix')}</span>}
          {item.amount != null ? `${item.count} · ` : ''}
          {item.amount != null ? <MoneyText value={item.amount} /> : <span className="tabular-nums">{item.count}</span>}
        </p>
      </div>
      {item.pumpId === selectedPumpId || !showPumpName ? (
        <Link to={item.targetPath} aria-label={actionLabel} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.review')}
        </Link>
      ) : (
        <button type="button" onClick={openOtherPump} aria-label={actionLabel} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.review')}
        </button>
      )}
    </li>
  )
}

/** The ranked list of things to act on today, each linking to the page and filter that handles it. */
export function AttentionInbox({ pumpId, allPumps }: { pumpId: number | null; allPumps: boolean }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['attention', allPumps ? 'all' : pumpId],
    queryFn: () => (allPumps ? attentionApi.getForMyPumps() : attentionApi.getForPump(pumpId!)),
    enabled: allPumps || pumpId != null,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  })

  return (
    <PageSection
      title={t('attention.title')}
      actions={items && items.length > 0 && (
        <span className="text-xs text-ink-3">{t('attention.itemCount', { count: items.length })}</span>
      )}
      flush
    >
      {isLoading ? (
        <div className="px-4 py-3" aria-busy="true" aria-label={t('attention.loading')}>
          <SkeletonRows count={3} />
        </div>
      ) : isError ? (
        <p role="alert" className="px-4 py-3 text-sm text-bad">
          {t('attention.loadError')}
        </p>
      ) : !items || items.length === 0 ? (
        <p role="status" className="flex items-center gap-2 px-4 py-4 text-sm font-medium text-ok">
          <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
          {t('attention.allClear')}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(item => (
            <AttentionRow key={`${item.pumpId}-${item.type}`} item={item} showPumpName={allPumps} />
          ))}
        </ul>
      )}
    </PageSection>
  )
}
