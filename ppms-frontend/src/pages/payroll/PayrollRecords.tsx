import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { PayrollRecord, PayrollStatus } from '../../api/payrollApi'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { PayrollGroup } from './PayrollGroup'
import { STATUS_ORDER, fmtMonthKey } from './payrollFormat'
import { usePayrollGroups } from './usePayrollGroups'
import { CsvExportButton } from '../../components/CsvExportButton'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { codeLabel } from '../../constants/labels'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'

function payrollColumns(staff: StaffMember[]): CsvColumn<PayrollRecord>[] {
  const nameOf = (userId: number) => staff.find((member) => member.id === userId)?.fullName ?? `User #${userId}`
  return [
    { header: 'Staff', value: (row) => nameOf(row.userId) },
    { header: 'Period from', value: (row) => row.periodFrom, kind: 'date' },
    { header: 'Period to', value: (row) => row.periodTo, kind: 'date' },
    { header: 'Salary type', value: (row) => codeLabel(row.salaryType) },
    { header: 'Shifts', value: (row) => row.totalShifts, kind: 'number' },
    { header: 'Days worked', value: (row) => row.daysWorked, kind: 'number' },
    { header: 'Gross', value: (row) => row.grossAmount, kind: 'money' },
    { header: 'Deductions', value: (row) => row.deductions, kind: 'money' },
    { header: 'Net pay', value: (row) => row.netPay, kind: 'money' },
    { header: 'Status', value: (row) => codeLabel(row.status) },
    { header: 'Notes', value: (row) => row.notes },
  ]
}

interface PayrollRecordsProps {
  pumpId: number
  staff: StaffMember[]
  records: PayrollRecord[]
  isLoading: boolean
  openGroup: PayrollStatus | null
  onOpenGroupChange: (status: PayrollStatus | null) => void
}

export function PayrollRecords({ pumpId, staff, records, isLoading, openGroup, onOpenGroupChange }: PayrollRecordsProps) {
  const { t } = useTranslation('payroll')
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
    mutationFn: (recordId: number) => payrollApi.deletePayroll(pumpId, recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast(t('records.deleted'), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('records.deleteFailed')), 'error'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: number; status: PayrollStatus }) =>
      payrollApi.updateStatus(pumpId, recordId, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast(t(`records.statusUpdated.${status}`), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('records.statusFailed')), 'error'),
  })

  const resetPages = () => { setDraftPage(0); setApprovedPage(0); setPaidPage(0) }
  const clearFilters = () => { setNameSearch(''); setSelectedMonth(''); resetPages() }

  return (
    <PageSection
      title={t('records.title')}
      titleMeta={filtered.length > 0 && <span className="text-sm text-ink-3">{t('records.count', { count: filtered.length })}</span>}
      actions={(
        <CsvExportButton
          filename={csvFilename(selectedMonth ? `payroll-${selectedMonth}` : 'payroll')}
          columns={payrollColumns(staff)}
          rows={filtered}
        />
      )}
      flush
    >
      <FilterBar label={t('records.filtersLabel')} onClearFilters={clearFilters} hasActiveFilters={Boolean(nameSearch || selectedMonth)}>
        <input aria-label={t('records.searchLabel')}
          type="search"
          value={nameSearch}
          onChange={e => { setNameSearch(e.target.value); resetPages() }}
          placeholder={t('records.searchPlaceholder')}
          className="text-sm w-44"
        />
        {monthOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="payroll-filter" className="text-xs text-ink-3">{t('records.month')}</label>
            <select id="payroll-filter"
              value={selectedMonth}
              onChange={e => { setSelectedMonth(e.target.value); resetPages() }}
              className="text-sm bg-surface"
            >
              <option value="">{t('records.allMonths')}</option>
              {monthOptions.map(key => (
                <option key={key} value={key}>{fmtMonthKey(key)}</option>
              ))}
            </select>
          </div>
        )}
      </FilterBar>

      <div className="ui-page-section__body">
        {isLoading ? (
          <SkeletonTable rows={4} cols={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="payroll"
            title={records.length === 0 ? t('records.emptyTitle') : t('records.emptyMonthTitle')}
            subtitle={records.length === 0 ? t('records.emptySubtitle') : t('records.emptyMonthSubtitle')}
          />
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
    </PageSection>
  )
}
