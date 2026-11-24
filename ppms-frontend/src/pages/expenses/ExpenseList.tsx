import { useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, ApproveExpenseRequest, ExpenseApprovalStatus, PumpExpense } from '../../api/expenseApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { formatCurrency } from '../../utils/format'
import { ConfirmButton } from '../../components/ConfirmButton'
import { RejectReasonDialog } from '../../components/RejectReasonDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { approvalStatusBadge } from '../../components/statusBadges'
import { MoneyText } from '../../components/AmountText'
import { CATEGORIES, fmtDate } from './expenseFormat'
import type { ExpenseListState } from './useExpenseList'
import { codeLabel } from '../../constants/labels'
import { CsvExportButton } from '../../components/CsvExportButton'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'

function csvColumns(t: TFunction<['expenses', 'common']>): CsvColumn<PumpExpense>[] {
  return [
    { header: t('csv.date'), value: (row) => row.expenseDate, kind: 'date' },
    { header: t('csv.category'), value: (row) => codeLabel(row.category) },
    { header: t('csv.description'), value: (row) => row.description },
    { header: t('csv.amount'), value: (row) => row.amount, kind: 'money' },
    { header: t('csv.status'), value: (row) => codeLabel(row.approvalStatus) },
    { header: t('csv.approvalNotes'), value: (row) => row.approvalNotes },
  ]
}

function ApprovalBadge({ expense }: { expense: PumpExpense }) {
  const { t } = useTranslation(['expenses', 'common'])
  const badge = approvalStatusBadge(expense.approvalStatus)
  const label = expense.approvalStatus === 'REJECTED' && expense.approvalNotes
    ? t('list.rejectedWithNotes', { label: badge.label, notes: expense.approvalNotes })
    : badge.label
  return <StatusBadge {...badge} label={label} wrap />
}

interface ExpenseListProps {
  pumpId: number | null
  list: ExpenseListState
}

export function ExpenseList({ pumpId, list }: ExpenseListProps) {
  const { t } = useTranslation(['expenses', 'common'])
  const columns = useMemo(() => csvColumns(t), [t])
  const { user }     = useAuthStore()
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const {
    expensesPage, expenses, isLoading,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    setPage, setPageSize, loadAllExpenses,
  } = list

  const submitMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.submitExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast(t('toast.submitted'), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('toast.submitFailed')), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.deleteExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast(t('toast.deleted'), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('toast.deleteFailed')), 'error'),
  })

  const [rejectingExpense, setRejectingExpense] = useState<PumpExpense | null>(null)
  const [rejectError, setRejectError] = useState<string | null>(null)

  const approveMutation = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: number; data: ApproveExpenseRequest }) =>
      expenseApi.approveExpense(pumpId!, expenseId, data),
    onSuccess: (_, { data }) => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      qc.invalidateQueries({ queryKey: ['approvals', pumpId] })
      setRejectingExpense(null)
      addToast(data.action === 'APPROVED' ? t('toast.approved') : t('toast.rejected'), data.action === 'APPROVED' ? 'success' : 'warning')
    },
    onError: (err, { data }) => {
      const message = parseApiError(err, t('toast.updateFailed'))
      if (data.action === 'REJECTED') setRejectError(message)
      else addToast(message, 'error')
    },
  })

  const openRejectDialog = (expense: PumpExpense) => {
    setRejectError(null)
    setRejectingExpense(expense)
  }

  const isOwner        = user?.role === 'OWNER'
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isAccountant   = user?.role === 'ACCOUNTANT'

  const clearFilters = () => { setCategoryFilter(''); setStatusFilter(''); setPage(0) }

  return (
    <>
    {rejectingExpense && (
      <RejectReasonDialog
        title={t('list.rejectTitle')}
        subtitle={`${codeLabel(rejectingExpense.category)} · ${formatCurrency(rejectingExpense.amount)} · ${rejectingExpense.description}`}
        isPending={approveMutation.isPending}
        error={rejectError}
        onConfirm={(reason) => approveMutation.mutate({
          expenseId: rejectingExpense.id, data: { action: 'REJECTED', notes: reason },
        })}
        onClose={() => setRejectingExpense(null)}
      />
    )}
    <PageSection
      title={t('list.title')}
      description={isOwnerOrAdmin && (
        <Trans t={t} i18nKey="list.approvalHint" components={{ status: <span className="font-semibold text-warn" /> }} />
      )}
      actions={<CsvExportButton filename={csvFilename('expenses')} columns={columns} rows={loadAllExpenses} disabled={expenses.length === 0} />}
      flush
    >
      <FilterBar label={t('list.filtersLabel')} onClearFilters={clearFilters} hasActiveFilters={Boolean(categoryFilter || statusFilter)}>
        <div className="w-52 max-w-full">
          <SearchableSelect label={t('list.filterByCategory')}
            value={categoryFilter}
            onChange={v => { setCategoryFilter(v as ExpenseCategory | ''); setPage(0) }}
            options={[
              { value: '', label: t('list.allCategories') },
              ...CATEGORIES.map(c => ({ value: c, label: codeLabel(c) })),
            ]}
            size="sm"
          />
        </div>
        <div className="w-52 max-w-full">
          <SearchableSelect label={t('list.filterByStatus')}
            value={statusFilter}
            onChange={v => { setStatusFilter(v as ExpenseApprovalStatus | ''); setPage(0) }}
            options={[
              { value: '', label: t('list.allStatuses') },
              { value: 'DRAFT',            label: t('list.statusDraft') },
              { value: 'PENDING_APPROVAL', label: t('list.statusPendingApproval') },
              { value: 'APPROVED',         label: t('list.statusApproved') },
              { value: 'REJECTED',         label: t('list.statusRejected') },
            ]}
            size="sm"
          />
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonTable rows={4} cols={3} /></div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon="expenses"
          title={t('list.emptyTitle')}
          subtitle={isAccountant ? t('list.emptyAccountant') : t('list.emptySubtitle')}
        />
      ) : (
        <>
        <div className="divide-y divide-border">
          {expenses.map(e => (
            <div key={e.id} className="px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                <StatusBadge tone="neutral" label={codeLabel(e.category)} className="flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <p className="text-sm text-ink break-words sm:truncate">{e.description}</p>
                    <ApprovalBadge expense={e} />
                  </div>
                  <p className="text-xs text-ink-3">{fmtDate(e.expenseDate)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                <MoneyText
                  value={e.amount}
                  className={`text-sm font-semibold mr-auto sm:mr-0 ${e.approvalStatus === 'REJECTED' ? 'text-ink-3 line-through' : 'text-ink'}`}
                />
                {/* Submit — shown on DRAFT expenses to the creator or OWNER/ADMIN */}
                {e.approvalStatus === 'DRAFT' && (isOwnerOrAdmin || e.recordedByUserId === user?.userId) && (
                  <button
                    onClick={() => submitMutation.mutate(e.id)}
                    disabled={submitMutation.isPending}
                    className="ui-btn ui-btn-primary ui-btn-compact"
                  >
                    {t('common:actions.submit')}
                  </button>
                )}
                {/* Approve/Reject — only for Owner/Admin on pending expenses */}
                {isOwnerOrAdmin && e.approvalStatus === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      onClick={() => approveMutation.mutate({ expenseId: e.id, data: { action: 'APPROVED' } })}
                      disabled={approveMutation.isPending}
                      className="ui-btn ui-btn-primary ui-btn-compact"
                    >
                      {t('common:actions.approve')}
                    </button>
                    <button
                      onClick={() => openRejectDialog(e)}
                      disabled={approveMutation.isPending}
                      className="ui-btn ui-btn-danger ui-btn-compact"
                    >
                      {t('common:actions.reject')}
                    </button>
                  </>
                )}
                {/* Delete — DRAFT only, backend enforces this; OWNER only */}
                {isOwner && e.approvalStatus === 'DRAFT' && (
                  <ConfirmButton
                    onConfirm={() => deleteMutation.mutate(e.id)}
                    disabled={deleteMutation.isPending}
                    triggerAriaLabel={t('list.deleteExpense')}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {expensesPage && (
          <div className="px-5">
            <Pagination
              data={expensesPage}
              onPageChange={p => setPage(p)}
              onPageSizeChange={s => { setPageSize(s); setPage(0) }}
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        )}
        </>
      )}
    </PageSection>
    </>
  )
}
