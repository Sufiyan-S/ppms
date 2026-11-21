import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, ApproveExpenseRequest, ExpenseApprovalStatus } from '../../api/expenseApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { formatCurrency } from '../../utils/format'
import { ConfirmButton } from '../../components/ConfirmButton'
import { CATEGORIES, CATEGORY_COLORS, fmtDate } from './expenseFormat'
import type { ExpenseListState } from './useExpenseList'
import { codeLabel } from '../../constants/labels'

interface ExpenseListProps {
  pumpId: number | null
  list: ExpenseListState
}

export function ExpenseList({ pumpId, list }: ExpenseListProps) {
  const { user }     = useAuthStore()
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const {
    expensesPage, expenses, isLoading,
    categoryFilter, setCategoryFilter, statusFilter, setStatusFilter,
    setPage, setPageSize,
  } = list

  const submitMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.submitExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast('Expense submitted for approval', 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to submit expense'), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.deleteExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast('Expense deleted', 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to delete expense'), 'error'),
  })

  const approveMutation = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: number; data: ApproveExpenseRequest }) =>
      expenseApi.approveExpense(pumpId!, expenseId, data),
    onSuccess: (_, { data }) => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast(`Expense ${data.action === 'APPROVED' ? 'approved' : 'rejected'}`, data.action === 'APPROVED' ? 'success' : 'warning')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to update expense'), 'error'),
  })

  const isOwner        = user?.role === 'OWNER'
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isAccountant   = user?.role === 'ACCOUNTANT'

  return (
    <Reveal delay={240}>
    <div className="ui-card p-0 overflow-hidden">
      <div className="ui-toolbar">
        <p className="ui-toolbar-title">All Expenses</p>
        <div className="ui-toolbar-actions">
          <div className="w-52 max-w-full">
          <SearchableSelect label="Filter by category"
            value={categoryFilter}
            onChange={v => { setCategoryFilter(v as ExpenseCategory | ''); setPage(0) }}
            options={[
              { value: '', label: 'All Categories' },
              ...CATEGORIES.map(c => ({ value: c, label: codeLabel(c) })),
            ]}
            size="sm"
          />
        </div>

          <div className="w-52 max-w-full">
          <SearchableSelect label="Filter by status"
            value={statusFilter}
            onChange={v => { setStatusFilter(v as ExpenseApprovalStatus | ''); setPage(0) }}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'DRAFT',            label: 'Draft' },
              { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
              { value: 'APPROVED',         label: 'Approved' },
              { value: 'REJECTED',         label: 'Rejected' },
            ]}
            size="sm"
          />
        </div>

          {(categoryFilter || statusFilter) && (
            <button
              onClick={() => { setCategoryFilter(''); setStatusFilter(''); setPage(0) }}
              className="ui-btn ui-btn-ghost text-xs"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {isOwnerOrAdmin && (
        <div className="px-5 py-2 text-xs text-slate-500 border-b border-slate-100 bg-slate-50/80">
          Approve and reject actions appear only for expenses in <span className="font-semibold text-amber-700">Pending Approval</span>.
        </div>
      )}

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonTable rows={4} cols={3} /></div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon="expenses"
          title="No expenses recorded yet"
          subtitle={isAccountant ? 'No records to display.' : 'Use the form above to record your first expense.'}
        />
      ) : (
        <>
        <div className="divide-y divide-slate-100">
          {expenses.map(e => (
            <div key={e.id} className="px-5 py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[e.category]}`}>
                  {codeLabel(e.category)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <p className="text-sm text-slate-700 break-words sm:truncate">{e.description}</p>
                    {e.approvalStatus === 'DRAFT' && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Draft
                      </span>
                    )}
                    {e.approvalStatus === 'PENDING_APPROVAL' && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pending Approval
                      </span>
                    )}
                    {e.approvalStatus === 'APPROVED' && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Approved
                      </span>
                    )}
                    {e.approvalStatus === 'REJECTED' && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Rejected{e.approvalNotes ? `: ${e.approvalNotes}` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{fmtDate(e.expenseDate)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                <span className={`text-sm font-semibold mr-auto sm:mr-0 ${e.approvalStatus === 'REJECTED' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                  {formatCurrency(e.amount)}
                </span>
                {/* Submit — shown on DRAFT expenses to the creator or OWNER/ADMIN */}
                {e.approvalStatus === 'DRAFT' && (isOwnerOrAdmin || e.recordedByUserId === user?.userId) && (
                  <button
                    onClick={() => submitMutation.mutate(e.id)}
                    disabled={submitMutation.isPending}
                    className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs"
                  >
                    Submit
                  </button>
                )}
                {/* Approve/Reject — only for Owner/Admin on pending expenses */}
                {isOwnerOrAdmin && e.approvalStatus === 'PENDING_APPROVAL' && (
                  <>
                    <button
                      onClick={() => approveMutation.mutate({ expenseId: e.id, data: { action: 'APPROVED' } })}
                      disabled={approveMutation.isPending}
                      className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => approveMutation.mutate({ expenseId: e.id, data: { action: 'REJECTED' } })}
                      disabled={approveMutation.isPending}
                      className="ui-btn ui-btn-danger min-h-0 px-3 py-1 text-xs"
                    >
                      Reject
                    </button>
                  </>
                )}
                {/* Delete — DRAFT only, backend enforces this; OWNER only */}
                {isOwner && e.approvalStatus === 'DRAFT' && (
                  <ConfirmButton
                    onConfirm={() => deleteMutation.mutate(e.id)}
                    disabled={deleteMutation.isPending}
                    triggerAriaLabel="Delete expense"
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
    </div>
    </Reveal>
  )
}
