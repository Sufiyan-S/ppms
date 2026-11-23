import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { canPerformAction } from '../../permissions/permissions'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { CashEntryDialog } from './CashEntryDialog'
import { CashEventList } from './CashEventList'
import { useCashEvents } from './useCashEvents'

/** The pump safe's balance and every cash movement; ?action=cash-entry opens the entry form. */
export default function CashDrawerPage() {
  const { t } = useTranslation(['cash', 'common'])
  const { user } = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()
  const canRecord = canPerformAction('cash:record-event', user?.role)
  const entryAction = useUrlParam('action')
  const showEntry = entryAction.value === 'cash-entry' && canRecord && pumpId !== null

  const events = useCashEvents(pumpId)
  const { cashData, cashError } = events
  const balance = cashData?.currentBalance ?? 0

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={cashData && (
          <StatusBadge tone="neutral" label={t('page.eventCount', { count: cashData.events?.totalElements ?? 0 })} />
        )}
        primaryAction={canRecord && pumpId !== null && (
          <button type="button" onClick={() => entryAction.set('cash-entry')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('form.title')}
          </button>
        )}
      />

      {pumpId === null ? (
        <div className="ui-card text-center text-sm text-ink-3">{t('common:notices.noPump')}</div>
      ) : (
        <>
          {cashError && (
            <div className="ui-alert ui-alert-warning text-sm">
              {t('page.loadFailed')}
            </div>
          )}

          <div className="ui-card border-l-4 border-l-primary">
            <p className="text-sm text-ink-2">{t('page.currentBalance')}</p>
            <MoneyText value={balance} className="mt-1 block text-3xl font-bold text-ink" />
            <p className="mt-1 text-xs text-ink-3">{t('page.balanceHint')}</p>
          </div>

          <CashEventList events={events} />
        </>
      )}

      {showEntry && <CashEntryDialog pumpId={pumpId} balance={balance} onClose={entryAction.remove} />}
    </Page>
  )
}
