import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, CreateExpenseRequest, ApproveExpenseRequest, ExpenseApprovalStatus } from '../../api/expenseApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, localDateInputValue } from '../../utils/date'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'

const CATEGORIES: ExpenseCategory[] = ['FUEL', 'MAINTENANCE', 'SALARY', 'UTILITIES', 'EQUIPMENT', 'OTHER']

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  FUEL:        'bg-orange-100 text-orange-700',
  MAINTENANCE: 'bg-blue-100 text-blue-700',
  SALARY:      'bg-emerald-100 text-emerald-700',
  UTILITIES:   'bg-purple-100 text-purple-700',
  EQUIPMENT:   'bg-slate-100 text-slate-700',
  OTHER:       'bg-gray-100 text-gray-600',
}

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return formatIstDate(d)
}

export default function ExpensesPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | ''>('')
  const [statusFilter, setStatusFilter] = useState<ExpenseApprovalStatus | ''>('')

  const { data: expensesPage, isLoading } = useQuery({
    queryKey:  ['expenses', pumpId, page, pageSize, categoryFilter, statusFilter],
    queryFn:   () => expenseApi.getExpenses(
      pumpId!,
      page,
      pageSize,
      categoryFilter || undefined,
      (statusFilter as any) || undefined,
    ),
    enabled:   !!pumpId,
  })

  const expenses = expensesPage?.content ?? []

  const [form, setForm] = useState<CreateExpenseRequest>({
    category: 'MAINTENANCE',
    amount: 0,
    description: '',
    expenseDate: localDateInputValue(),
    saveDraft: false,
  })
  const { addToast } = useToastStore()
  const [formError, setFormError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: CreateExpenseRequest) => expenseApi.createExpense(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      setForm({ category: 'MAINTENANCE', amount: 0, description: '', expenseDate: localDateInputValue(), saveDraft: false })
      setFormError(null)
      setReviewOpen(false)
      addToast('Expense recorded successfully', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to record expense'
      setFormError(msg)
      addToast(msg, 'error')
    },
  })

  const submitMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.submitExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast('Expense submitted for approval', 'success')
    },
    onError: (err: any) => addToast(err?.response?.data?.message ?? 'Failed to submit expense', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (expenseId: number) => expenseApi.deleteExpense(pumpId!, expenseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast('Expense deleted', 'success')
    },
    onError: (err: any) => addToast(err?.response?.data?.message ?? 'Failed to delete expense', 'error'),
  })

  const validateForm = () => {
    if (!form.description.trim()) {
      setFormError('Description is required')
      return false
    }
    if (form.amount <= 0) {
      setFormError('Amount must be greater than zero')
      return false
    }
    setFormError(null)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setReviewOpen(true)
  }

  const approveMutation = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: number; data: ApproveExpenseRequest }) =>
      expenseApi.approveExpense(pumpId!, expenseId, data),
    onSuccess: (_, { data }) => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast(`Expense ${data.action === 'APPROVED' ? 'approved' : 'rejected'}`, data.action === 'APPROVED' ? 'success' : 'warning')
    },
    onError: (err: any) => addToast(err?.response?.data?.message ?? 'Failed to update expense', 'error'),
  })

  // Note: totalExpenses and pendingCount reflect the current page only.
  // For a pump with many expenses spread across pages, these numbers represent the visible page.
  const totalExpenses = expenses
    .filter(e => e.approvalStatus === 'APPROVED')
    .reduce((sum, e) => sum + e.amount, 0)
  const pendingCount = expenses.filter(e => e.approvalStatus === 'PENDING_APPROVAL').length
  const isOwner = user?.role === 'OWNER'
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isAccountant = user?.role === 'ACCOUNTANT'

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Cost tracking</p>
          <h1 className="ui-title-sm">Expense Tracker</h1>
          <p className="ui-subtitle">Record and review operational expenses at the pump</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Records</span>
            <span className="ui-section-meta-value">{expensesPage?.totalElements ?? 0}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Pending</span>
            <span className="ui-section-meta-value">{pendingCount}</span>
          </div>
        </div>
      </div>

      </Reveal>

      {/* ── Summary strip ── */}
      {!isLoading && (
        <Reveal delay={120}>
        <div className="ui-summary-strip">
          <div className="ui-summary-strip__item">
            <span className="ui-summary-strip__label">Approved Total</span>
            <span className="ui-summary-strip__value">{fmtAmt(totalExpenses)}</span>
          </div>
          <div className="ui-summary-strip__item">
            <span className="ui-summary-strip__label">Total Records</span>
            <span className="ui-summary-strip__value">{expensesPage?.totalElements ?? 0}</span>
          </div>
          {pendingCount > 0 && (
            <div className="ui-summary-strip__item">
              <span className="ui-summary-strip__label text-amber-500">Pending Approval</span>
              <span className="ui-summary-strip__value text-amber-600">{pendingCount}</span>
            </div>
          )}
        </div>
        </Reveal>
      )}

      {/* ── Add expense form — hidden for ACCOUNTANT (read-only role) ── */}
      {!isAccountant && <Reveal delay={180}><form onSubmit={handleSubmit} className="ui-card ui-form-shell">
        <div className="ui-form-shell__head">
          <div>
            <p className="ui-section-kicker mb-2">Expense Intake</p>
            <h2 className="ui-title-sm">Record expense</h2>
            <p className="ui-subtitle mt-1">Capture the category, amount, date, and description before review.</p>
          </div>
        </div>

        <div className="ui-form-shell__grid">
          <div>
            <label className="ui-label">Category</label>
            <SearchableSelect
              value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v as ExpenseCategory }))}
              options={CATEGORIES.map(c => ({ value: c, label: c.replace('_', ' ') }))}
            />
          </div>

          <div>
            <label className="ui-label">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount || ''}
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className="text-sm"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="ui-label">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="text-sm"
              placeholder="e.g. Pump servicing by XYZ"
              required
            />
          </div>

          <div>
            <label className="ui-label">Expense Date</label>
            <input
              type="date"
              value={form.expenseDate}
              onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
              className="text-sm"
              required
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={!!form.saveDraft}
            onChange={e => setForm(f => ({ ...f, saveDraft: e.target.checked }))}
            className="rounded border-slate-300 text-blue-600"
          />
          Save as draft — submit for approval later
        </label>

        {formError && <p className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {createMutation.isPending
            ? <span className="flex items-center gap-1.5"><Spinner />Saving…</span>
            : 'Review Expense'}
        </button>
      </form></Reveal>}

      {reviewOpen && (
        <ModalPortal>
        <div className="ui-modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div className="ui-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Review Expense</h2>
                <p className="ui-modal-subtitle">Verify the expense details before saving the record.</p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
            </div>
            <div className="ui-modal-body space-y-4">
              {formError && <div className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>}
              <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Category</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[form.category]}`}>
                    {form.category.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Amount</span>
                  <span className="font-medium text-sm text-slate-800">{fmtAmt(form.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Description</span>
                  <span className="font-medium text-right text-sm text-slate-800">{form.description.trim()}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Expense Date</span>
                  <span className="font-medium text-sm text-slate-800">{fmtDate(form.expenseDate)}</span>
                </div>
              </div>
            </div>
            <div className="ui-modal-footer">
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-secondary">
                Back
              </button>
              <button
                onClick={() => {
                  if (!validateForm()) return
                  createMutation.mutate(form)
                }}
                disabled={createMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {createMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner />Saving…</span>
                  : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Expense list ── */}
      <Reveal delay={240}>
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">All Expenses</p>
          <div className="ui-toolbar-actions">
            <div className="w-52 max-w-full">
            <SearchableSelect
              value={categoryFilter}
              onChange={v => { setCategoryFilter(v as any); setPage(0) }}
              options={[
                { value: '', label: 'All Categories' },
                ...CATEGORIES.map(c => ({ value: c, label: c.replace('_', ' ') })),
              ]}
              size="sm"
            />
          </div>

            <div className="w-52 max-w-full">
            <SearchableSelect
              value={statusFilter}
              onChange={v => { setStatusFilter(v as any); setPage(0) }}
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
              <div key={e.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[e.category]}`}>
                    {e.category}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <p className="text-sm text-slate-700 truncate">{e.description}</p>
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
                    <p className="text-xs text-slate-400">{fmtDate(e.expenseDate)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-sm font-semibold ${e.approvalStatus === 'REJECTED' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {fmtAmt(e.amount)}
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
                    <button
                      onClick={() => deleteMutation.mutate(e.id)}
                      disabled={deleteMutation.isPending}
                      className="ui-btn ui-btn-ghost min-h-0 p-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
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
    </div>
  )
}
