import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { BarChart2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { pumpApi } from '../../api/pumpApi'
import { useOnValuesChange } from '../../hooks/useOnValuesChange'
import { Pagination } from '../../components/Pagination'
import { localDateInputValue } from '../../utils/date'
import { useDateRangeParams } from '../../hooks/useDateRangeParams'
import { DatePresetChips } from '../../components/DatePresetChips'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { FilterBar } from '../../components/layout/FilterBar'
import { ListDetail } from '../../components/layout/ListDetail'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import type { DeletableSheet } from './DeleteConfirmModal'
import { DetailPanel } from './DetailPanel'
import { GenerateModal } from './GenerateModal'
import { ReportListItem } from './ReportListItem'

const GENERATE_ACTION = 'generate-sheet'

/**
 * Sheets in a date range beside the sheet named in ?sheet= (desktop) or on its own screen (phone).
 * ?action=generate-sheet opens the Generate form.
 */
export default function BalanceSheetPage() {
  const { t } = useTranslation(['balancesheet', 'common'])
  const { user } = useAuthStore()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canView   = canManage || user?.role === 'MANAGER'

  const { selectedPumpId: pumpId } = usePumpStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deleteTarget, setDeleteTarget] = useState<DeletableSheet | null>(null)
  const sheetText = searchParams.get('sheet')
  const selectedId = sheetText && /^\d+$/.test(sheetText) ? Number(sheetText) : null
  const showGenerateModal = searchParams.get('action') === GENERATE_ACTION && Boolean(pumpId)

  const [filterRange, setFilterRange] = useDateRangeParams(() => ({ from: localDateInputValue(-7), to: localDateInputValue(0) }))
  const { from: filterFrom, to: filterTo } = filterRange

  const [bsPage, setBsPage]         = useState(0)
  const [bsPageSize, setBsPageSize] = useState(10)

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''

  useOnValuesChange([filterFrom, filterTo, pumpId], () => setBsPage(0))

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

  const updateParams = (change: (params: URLSearchParams) => void, replace: boolean) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    change(updated)
    return updated
  }, { replace })

  const searchFor = (sheetId: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('sheet', String(sheetId))
    return `?${params.toString()}`
  }

  const openGenerate = () => updateParams((params) => params.set('action', GENERATE_ACTION), false)
  const closeGenerate = () => updateParams((params) => params.delete('action'), true)
  const openGeneratedSheet = (sheetId: number) => updateParams((params) => {
    params.delete('action')
    params.set('sheet', String(sheetId))
  }, true)
  const closeSheet = () => updateParams((params) => params.delete('sheet'), false)

  if (!canView) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('list.noPermission')}
        </div>
      </Page>
    )
  }

  const generateButton = (
    <button
      type="button"
      onClick={openGenerate}
      disabled={!pumpId}
      className="ui-btn ui-btn-primary inline-flex items-center gap-1.5 disabled:opacity-40"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      {t('list.generateSheet')}
    </button>
  )

  const list = (
    <>
      <FilterBar
        label={t('list.filtersLabel')}
        onClearFilters={() => setFilterRange({ from: '', to: '' })}
        hasActiveFilters={Boolean(filterFrom || filterTo)}
        summary={reportsPage && t('list.sheetCount', { count: reportsPage.totalElements })}
      >
        <DatePresetChips range={filterRange} onSelect={setFilterRange} />
        <div className="flex w-full flex-wrap items-center gap-2">
          <input aria-label={t('common:fields.fromDate')}
            type="date"
            value={filterFrom}
            onChange={e => setFilterRange({ from: e.target.value, to: filterTo })}
            className="min-w-[8.5rem] flex-1 text-xs text-ink"
          />
          <span className="text-xs text-ink-3">{t('list.to')}</span>
          <input aria-label={t('common:fields.toDate')}
            type="date"
            value={filterTo}
            onChange={e => setFilterRange({ from: filterFrom, to: e.target.value })}
            className="min-w-[8.5rem] flex-1 text-xs text-ink"
          />
        </div>
      </FilterBar>

      {(!pumpId || isLoading) ? (
        <div className="px-4 py-4"><SkeletonRows count={5} /></div>
      ) : reports.length === 0 ? (
        <EmptyState icon="generic" title={t('list.emptyTitle')} subtitle={t('list.emptySubtitle')} />
      ) : (
        <ul>
          {reports.map(report => (
            <li key={report.id}>
              <ReportListItem report={report} search={searchFor(report.id)} isSelected={selectedId === report.id} />
            </li>
          ))}
        </ul>
      )}

      {reportsPage && (
        <div className="px-3">
          <Pagination
            data={reportsPage}
            onPageChange={setBsPage}
            onPageSizeChange={s => { setBsPageSize(s); setBsPage(0) }}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}
    </>
  )

  const placeholder = (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <BarChart2 size={40} strokeWidth={1.5} aria-hidden="true" className="text-ink-3" />
      <p className="text-sm font-medium text-ink">{t('list.selectReport')}</p>
      <p className="max-w-sm text-xs text-ink-3">{t('list.selectReportHint')}</p>
      {pumpId && generateButton}
    </div>
  )

  return (
    <Page>
      <div className="print:hidden">
        <PageHeader
          title={t('list.title')}
          description={t('list.description')}
          badges={pumpId && <RefreshIndicator isFetching={fetchingReports} dataUpdatedAt={reportsUpdatedAt ?? 0} />}
          primaryAction={generateButton}
        />
      </div>

      {!pumpId ? (
        <div className="ui-empty">{t('common:notices.noPump')}</div>
      ) : (
        <div className="ui-card overflow-hidden p-0 print:overflow-visible print:border-0 print:[&>div]:block print:[&>div>nav]:hidden">
          <ListDetail
            listLabel={t('list.listLabel')}
            detailLabel={t('list.detailLabel')}
            list={list}
            selectedId={selectedId}
            detail={selectedId !== null && (
              <DetailPanel
                key={selectedId}
                pumpId={pumpId}
                reportId={selectedId}
                onClose={closeSheet}
                canDelete={canManage}
                onDelete={(sheet) => { setDeleteTarget(sheet); closeSheet() }}
                onRegenerated={(newId) => updateParams((params) => params.set('sheet', String(newId)), true)}
                pumpName={pumpName}
              />
            )}
            placeholder={placeholder}
            onBack={closeSheet}
          />
        </div>
      )}

      {showGenerateModal && pumpId && (
        <GenerateModal pumpId={pumpId} onClose={closeGenerate} onGenerated={openGeneratedSheet} />
      )}

      {deleteTarget && pumpId && (
        <DeleteConfirmModal
          report={deleteTarget}
          pumpId={pumpId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </Page>
  )
}
