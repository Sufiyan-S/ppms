import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, BarChart2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { pumpApi } from '../../api/pumpApi'
import { useOnValuesChange } from '../../hooks/useOnValuesChange'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { Pagination } from '../../components/Pagination'
import { localDateInputValue } from '../../utils/date'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { IconButton } from '../../components/IconButton'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import { DetailPanel } from './DetailPanel'
import { GenerateModal } from './GenerateModal'
import { ReportListItem } from './ReportListItem'

// ── Main page ───────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const { user } = useAuthStore()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canView   = canManage || user?.role === 'MANAGER'

  const { selectedPumpId } = usePumpStore()
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BalanceSheetSummary | null>(null)

  // Date range filter — defaults to last 7 days → today (computed fresh on mount, not at module load)
  const [filterFrom, setFilterFrom] = useState(() => localDateInputValue(-7))
  const [filterTo, setFilterTo]     = useState(() => localDateInputValue(0))

  const [bsPage, setBsPage]         = useState(0)
  const [bsPageSize, setBsPageSize] = useState(10)

  const pumpId = selectedPumpId

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''

  useOnValuesChange([filterFrom, filterTo, pumpId], () => setBsPage(0))

  // Report list
  const { data: reportsPage, isLoading, isFetching: fetchingReports, dataUpdatedAt: reportsUpdatedAt } = useQuery({
    queryKey: ['balance-sheets', pumpId, filterFrom, filterTo, bsPage, bsPageSize],
    queryFn:  () => balanceSheetApi.list(
      pumpId!,
      filterFrom || undefined,
      filterTo   || undefined,
      bsPage,
      bsPageSize,
    ),
    enabled: !!pumpId,
  })

  const reports = reportsPage?.content ?? []

  // Selected report summary (for delete modal)
  const selectedSummary = reports.find(r => r.id === selectedReportId) ?? null

  if (!canView) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You do not have permission to view balance sheets.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden print:h-auto print:overflow-visible">
      {/* ── Left panel: list ────────────────────────────────────────────────── */}
      <div className={`flex flex-col ${selectedReportId ? 'hidden 2xl:flex w-[22rem] flex-shrink-0' : 'flex-1'} border-r border-slate-200 bg-white overflow-hidden print:hidden`}>
        {/* Page header */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-800">Balance Sheets</h1>
              <RefreshIndicator isFetching={fetchingReports} dataUpdatedAt={reportsUpdatedAt ?? 0} />
            </div>
            <button
              onClick={() => setShowGenerateModal(true)}
              disabled={!pumpId}
              className="ui-btn ui-btn-primary gap-1.5 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              <span className="text-base leading-none">+</span>
              Generate
            </button>
          </div>

          {/* Date range filter */}
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="From date"
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="flex-1 min-w-[8.5rem] text-xs text-slate-700"
              placeholder="From"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input aria-label="To date"
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="flex-1 min-w-[8.5rem] text-xs text-slate-700"
              placeholder="To"
            />
            {(filterFrom || filterTo) && (
              <IconButton
                onClick={() => { setFilterFrom(''); setFilterTo(''); setBsPage(0) }}
                className="ui-btn ui-btn-ghost text-slate-500 hover:text-slate-600"
                label="Clear date filter"
                icon={<X size={14} strokeWidth={2} />}
              />
            )}
          </div>
        </div>

        {/* Report list */}
        <div className="flex-1 overflow-y-auto">
          {(!pumpId || isLoading) && (
            <div className="px-4 py-4"><SkeletonRows count={5} /></div>
          )}

          {!isLoading && pumpId && reports.length === 0 && (
            <EmptyState
              icon="generic"
              title="No balance sheets found"
              subtitle="Generate a report after closing all shifts for a period."
            />
          )}

          {reports.map(report => (
            <ReportListItem
              key={report.id}
              report={report}
              isSelected={selectedReportId === report.id}
              onClick={() => setSelectedReportId(selectedReportId === report.id ? null : report.id)}
            />
          ))}

          {reportsPage && (
            <div className="px-3 border-t border-slate-100">
              <Pagination
                data={reportsPage}
                onPageChange={p => setBsPage(p)}
                onPageSizeChange={s => { setBsPageSize(s); setBsPage(0) }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: detail ──────────────────────────────────────────────── */}
      {selectedReportId && selectedSummary && (
        <DetailPanel
          pumpId={pumpId!}
          reportId={selectedReportId}
          summary={selectedSummary}
          onClose={() => setSelectedReportId(null)}
          canDelete={canManage}
          onDelete={(s) => { setDeleteTarget(s); setSelectedReportId(null) }}
          pumpName={pumpName}
        />
      )}

      {/* Empty detail state */}
      {!selectedReportId && (
        <div className="flex-1 hidden sm:flex items-center justify-center bg-slate-50/70">
          <div className="ui-empty">
            <div className="flex justify-center mb-3"><BarChart2 size={40} strokeWidth={1.5} className="text-slate-500" /></div>
            <p className="ui-subtitle">Select a report to view details</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showGenerateModal && pumpId && (
        <GenerateModal pumpId={pumpId} onClose={() => setShowGenerateModal(false)} />
      )}

      {deleteTarget && pumpId && (
        <DeleteConfirmModal
          report={deleteTarget}
          pumpId={pumpId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
