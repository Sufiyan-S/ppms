import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Hourglass, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { canPerformAction } from '../../permissions/permissions'
import { expenseApi } from '../../api/expenseApi'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { ExpenseEntryDialog } from './ExpenseEntryDialog'
import { ExpenseList } from './ExpenseList'
import { useExpenseList } from './useExpenseList'

/** Expenses at the pump with their approval status; ?action=add-expense opens the entry form. */
export default function ExpensesPage() {
  const { t } = useTranslation('expenses')
  const { user } = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()
  const canCreateExpense = canPerformAction('expense:create', user?.role)
  const entryAction = useUrlParam('action')
  const showEntry = entryAction.value === 'add-expense' && canCreateExpense && pumpId !== null

  const list = useExpenseList(pumpId)
  const { expensesPage, isLoading } = list

  const { data: summary } = useQuery({
    queryKey: ['expenses', pumpId, 'summary'],
    queryFn: () => expenseApi.getSummary(pumpId!),
    enabled: !!pumpId,
  })

  const totalExpenses = summary?.approvedTotal ?? 0
  const pendingCount = summary?.pendingCount ?? 0

  if (!pumpId) {
    return (
      <Page>
        <PageHeader title={t('page.title')} />
        <div className="ui-alert ui-alert-warning text-sm" role="status">
          {t('page.noPump')}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pendingCount > 0 && (
          <StatusBadge tone="warn" icon={Hourglass} label={t('page.pendingCount', { count: pendingCount })} />
        )}
        primaryAction={canCreateExpense && (
          <button type="button" onClick={() => entryAction.set('add-expense')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('form.title')}
          </button>
        )}
      />

      {!isLoading && (
        <div className="ui-summary-strip">
          <div className="ui-summary-strip__item">
            <span className="ui-summary-strip__label">{t('page.approvedTotal')}</span>
            <MoneyText value={totalExpenses} className="ui-summary-strip__value" />
          </div>
          <div className="ui-summary-strip__item">
            <span className="ui-summary-strip__label">{t('page.totalRecords')}</span>
            <span className="ui-summary-strip__value">{expensesPage?.totalElements ?? 0}</span>
          </div>
        </div>
      )}

      <ExpenseList pumpId={pumpId} list={list} />

      {showEntry && <ExpenseEntryDialog pumpId={pumpId} onClose={entryAction.remove} />}
    </Page>
  )
}
