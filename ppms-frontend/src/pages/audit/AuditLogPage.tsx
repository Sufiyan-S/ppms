import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { auditApi } from '../../api/auditApi'
import type { AuditAction, AuditLog } from '../../api/auditApi'
import { usePumpStore } from '../../store/usePumpStore'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'
import { DatePresetChips } from '../../components/DatePresetChips'
import { CsvExportButton } from '../../components/CsvExportButton'
import { useDateRangeParams } from '../../hooks/useDateRangeParams'
import { formatIstDateTime, localDateInputValue } from '../../utils/date'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { auditEntityLabel, auditEntityUrl } from '../../utils/drillDown'
import { StatusBadge } from '../../components/StatusBadge'
import { AUDIT_ACTION_TONES, auditActionLabel } from './auditActions'

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const EXPORT_PAGE_SIZE = 200
const EXPORT_MAX_PAGES = 25

// CSV headers stay in English: the files are shared with accountants.
const CSV_COLUMNS: CsvColumn<AuditLog>[] = [
  { header: 'When', value: (log) => formatIstDateTime(log.createdAt, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }) },
  { header: 'Action', value: (log) => auditActionLabel(log.action) },
  { header: 'By', value: (log) => log.actorName },
  { header: 'Description', value: (log) => log.description },
  { header: 'Entity', value: (log) => log.entityType },
  { header: 'Entity ID', value: (log) => log.entityId },
]

function fmtDateTime(d: string) {
  return formatIstDateTime(d, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function actionOptions(): [AuditAction, string][] {
  return (Object.keys(AUDIT_ACTION_TONES) as AuditAction[])
    .map((action): [AuditAction, string] => [action, auditActionLabel(action)])
    .sort(([, a], [, b]) => a.localeCompare(b))
}

export default function AuditLogPage() {
  const { t } = useTranslation(['audit', 'common'])
  const [range, setRange] = useDateRangeParams(() => ({ from: localDateInputValue(-1), to: localDateInputValue() }))
  const { from, to } = range
  const [action, setAction]       = useState<AuditAction | ''>('')
  const [actorId, setActorId]     = useState<number | null>(null)
  const [showSignIns, setShowSignIns] = useState(false)
  const [page, setPage]       = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { selectedPumpId: pumpId } = usePumpStore()

  const filters = {
    from: from || undefined,
    to: to || undefined,
    action: action || undefined,
    actorId: actorId ?? undefined,
    hideSignIns: !showSignIns,
  }

  const { data, isLoading } = useQuery({
    queryKey:  ['auditLogs', pumpId, page, pageSize, filters],
    queryFn:   () => auditApi.getAuditLogs({ pumpId: pumpId!, page, size: pageSize, ...filters }),
    enabled: !!pumpId,
  })

  const { data: actors = [] } = useQuery({
    queryKey: ['auditActors', pumpId],
    queryFn: () => auditApi.getActors(pumpId!),
    enabled: !!pumpId,
  })

  const logs         = data?.content            ?? []
  const totalPages   = data?.page?.totalPages   ?? 0
  const totalEvents  = data?.page?.totalElements ?? 0
  const currentPage  = data?.page?.number       ?? page
  const hasFilters   = !!(from || to || action || actorId)

  function applyRange(next: { from: string; to: string }) {
    setRange(next)
    setPage(0)
  }

  function handlePageSizeChange(value: number) {
    setPageSize(value)
    setPage(0)
  }

  function clearFilters() {
    setRange({ from: '', to: '' })
    setAction('')
    setActorId(null)
    setPage(0)
  }

  const loadAllEvents = async (): Promise<AuditLog[]> => {
    const all: AuditLog[] = []
    for (let exportPage = 0; exportPage < EXPORT_MAX_PAGES; exportPage++) {
      const result = await auditApi.getAuditLogs({ pumpId: pumpId!, page: exportPage, size: EXPORT_PAGE_SIZE, ...filters })
      all.push(...result.content)
      if (exportPage + 1 >= result.page.totalPages) break
    }
    return all
  }

  const rangeStart = totalEvents === 0 ? 0 : currentPage * pageSize + 1
  const rangeEnd   = Math.min((currentPage + 1) * pageSize, totalEvents)

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        secondaryActions={
          <CsvExportButton
            filename={csvFilename('audit', from && to ? { from, to } : undefined)}
            columns={CSV_COLUMNS}
            rows={loadAllEvents}
            disabled={totalEvents === 0}
          />
        }
      />

      <PageSection
        title={<>{hasFilters ? t('page.filteredEvents') : t('page.allEvents')} ({isLoading ? '…' : totalEvents})</>}
        titleMeta={!isLoading && totalPages > 0 && (
          <span className="text-xs text-ink-3">
            {t('common:pagination.pageOf', { page: currentPage + 1, total: totalPages })}
          </span>
        )}
        flush
      >
        <FilterBar label={t('page.filtersLabel')} onClearFilters={clearFilters} hasActiveFilters={hasFilters}>
          <div className="ui-filter-group w-full">
            <div className="basis-full"><DatePresetChips range={range} onSelect={applyRange} /></div>
            <label className="block">
              <span className="ui-label mb-0">{t('common:fields.from')}</span>
              <input
                type="date"
                value={from}
                onChange={e => applyRange({ from: e.target.value, to })}
                max={to || undefined}
                className="text-sm"
              />
            </label>
            <label className="block">
              <span className="ui-label mb-0">{t('common:fields.to')}</span>
              <input
                type="date"
                value={to}
                onChange={e => applyRange({ from, to: e.target.value })}
                min={from || undefined}
                className="text-sm"
              />
            </label>
            <label className="block">
              <span className="ui-label mb-0">{t('page.action')}</span>
              <select
                value={action}
                onChange={e => { setAction(e.target.value as AuditAction | ''); setPage(0) }}
                className="text-sm"
              >
                <option value="">{t('page.allActions')}</option>
                {actionOptions().map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-40">
              <span className="ui-label mb-0">{t('page.user')}</span>
              <select
                value={actorId ?? ''}
                onChange={e => { setActorId(e.target.value ? Number(e.target.value) : null); setPage(0) }}
                className="text-sm"
              >
                <option value="">{t('page.everyone')}</option>
                {actors.map(actor => (
                  <option key={actor.actorId} value={actor.actorId}>{actor.actorName}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex min-h-10 items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={showSignIns}
                onChange={e => { setShowSignIns(e.target.checked); setPage(0) }}
              />
              {t('page.showSignIns')}
            </label>
          </div>
        </FilterBar>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={5} /></div>
        ) : logs.length === 0 ? (
          <p className="ui-empty px-5 py-6">
            {hasFilters ? t('page.noEventsForFilters') : t('page.noEvents')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map(log => {
              const entityUrl = auditEntityUrl(log.entityType, log.entityId)
              return (
                <li key={log.id} className="px-(--density-card-pad) py-(--density-row-y)">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge
                        tone={AUDIT_ACTION_TONES[log.action] ?? 'neutral'}
                        label={auditActionLabel(log.action)}
                      />
                      <span className="text-xs text-ink-3">
                        <Trans t={t} i18nKey="page.by" values={{ name: log.actorName }} components={{ name: <span className="font-medium text-ink" /> }} />
                      </span>
                    </div>
                    <p className="text-xs text-ink-3 flex-shrink-0">{fmtDateTime(log.createdAt)}</p>
                  </div>
                  <p className="text-sm text-ink">{log.description}</p>
                  {log.entityId && (
                    <p className="text-xs text-ink-3 mt-0.5">
                      {entityUrl
                        ? <Link to={entityUrl} className="ui-link">{auditEntityLabel(log.entityType, log.entityId)}</Link>
                        : auditEntityLabel(log.entityType, log.entityId)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Pagination controls — always shown when there's data ── */}
        {!isLoading && totalEvents > 0 && (
          <div className="px-5 pb-4">
            <Pagination
              data={{
                content: logs,
                page: currentPage,
                pageSize,
                totalElements: totalEvents,
                totalPages,
                hasNext: currentPage < totalPages - 1,
                hasPrevious: currentPage > 0,
              }}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
            <div className="pt-2 text-center">
              <span className="text-xs text-ink-3">
                {t('page.showing', { from: rangeStart, to: rangeEnd, total: totalEvents })}
              </span>
            </div>
          </div>
        )}
      </PageSection>
    </Page>
  )
}

