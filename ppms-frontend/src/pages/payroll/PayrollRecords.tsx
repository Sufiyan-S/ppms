import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { PayrollRecord, PayrollStatus } from '../../api/payrollApi'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { PayrollGroup } from './PayrollGroup'
import { STATUS_ORDER, fmtMonthKey } from './payrollFormat'
import { usePayrollGroups } from './usePayrollGroups'

interface PayrollRecordsProps {
  pumpId: number | null
  staff: StaffMember[]
  records: PayrollRecord[]
  isLoading: boolean
  openGroup: PayrollStatus | null
  onOpenGroupChange: (status: PayrollStatus | null) => void
}

export function PayrollRecords({ pumpId, staff, records, isLoading, openGroup, onOpenGroupChange }: PayrollRecordsProps) {
  const { addToast } = useToastStore()
  const qc = useQueryClient()
  const {
    monthOptions, selectedMonth, setSelectedMonth, nameSearch, setNameSearch,
    draftPage, setDraftPage, draftPageSize, setDraftPageSize,
    approvedPage, setApprovedPage, approvedPageSize, setApprovedPageSize,
    paidPage, setPaidPage, paidPageSize, setPaidPageSize,
    filtered, grouped,
  } = usePayrollGroups(records, staff)

  function toggleGroup(status: PayrollStatus) {
    onOpenGroupChange(openGroup === status ? null : status)
  }

  const deleteMutation = useMutation({
    mutationFn: (recordId: number) => payrollApi.deletePayroll(pumpId!, recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast('Payroll record deleted', 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to delete payroll'), 'error'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: number; status: PayrollStatus }) =>
      payrollApi.updateStatus(pumpId!, recordId, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast(`Status updated to ${status}`, 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to update status'), 'error'),
  })

  return (
    <Reveal delay={210}>
    <div className="space-y-3">
      {/* Section header + month filter */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">
          Payroll Records
          {filtered.length > 0 && (
            <span className="ml-1.5 text-slate-500 font-normal">({filtered.length})</span>
          )}
        </p>

        <div className="flex items-center gap-3">
          <input aria-label="Search staff"
            type="search"
            value={nameSearch}
            onChange={e => { setNameSearch(e.target.value); setDraftPage(0); setApprovedPage(0); setPaidPage(0) }}
            placeholder="Search staff…"
            className="text-sm h-8 px-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
          />
          {monthOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="payroll-filter" className="text-xs text-slate-500">Month</label>
              <select id="payroll-filter"
                value={selectedMonth}
                onChange={e => {
                  setSelectedMonth(e.target.value)
                  setDraftPage(0); setApprovedPage(0); setPaidPage(0)
                }}
                className="text-sm bg-white"
              >
                <option value="">All months</option>
                {monthOptions.map(key => (
                  <option key={key} value={key}>{fmtMonthKey(key)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="ui-card px-5 py-4">
          <SkeletonTable rows={4} cols={3} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon="payroll"
            title={records.length === 0 ? 'No payroll records yet' : 'No records for this month'}
            subtitle={records.length === 0 ? 'Generate your first payroll draft above.' : 'Try selecting a different month.'}
          />
        </div>
      ) : (
        /* One collapsible group per status — only renders groups that have records */
        <div className="space-y-2">
          {STATUS_ORDER.filter(s => grouped[s].length > 0).map(status => {
            const allForStatus = grouped[status]
            const totalRecords = allForStatus.length
            const totalAmount  = allForStatus.reduce((s, r) => s + r.grossAmount, 0)

            const pageState = {
              DRAFT:    { page: draftPage,    pageSize: draftPageSize,
                          setPage: setDraftPage,    setPageSize: setDraftPageSize },
              APPROVED: { page: approvedPage, pageSize: approvedPageSize,
                          setPage: setApprovedPage, setPageSize: setApprovedPageSize },
              PAID:     { page: paidPage,     pageSize: paidPageSize,
                          setPage: setPaidPage,     setPageSize: setPaidPageSize },
            }[status]

            const totalPages = Math.max(1, Math.ceil(totalRecords / pageState.pageSize))
            const safePage   = Math.min(pageState.page, totalPages - 1)
            const pagedRecords = allForStatus.slice(
              safePage * pageState.pageSize,
              (safePage + 1) * pageState.pageSize,
            )

            return (
              <PayrollGroup
                key={status}
                status={status}
                records={pagedRecords}
                totalRecords={totalRecords}
                totalAmount={totalAmount}
                page={safePage}
                pageSize={pageState.pageSize}
                onPageChange={pageState.setPage}
                onPageSizeChange={s => { pageState.setPageSize(s); pageState.setPage(0) }}
                isOpen={openGroup === status}
                onToggle={() => toggleGroup(status)}
                staff={staff}
                onStatusChange={(recordId, next) => statusMutation.mutate({ recordId, status: next })}
                onDelete={(recordId) => deleteMutation.mutate(recordId)}
                isPending={statusMutation.isPending}
                isDeletePending={deleteMutation.isPending}
              />
            )
          })}
        </div>
      )}
    </div>
    </Reveal>
  )
}
