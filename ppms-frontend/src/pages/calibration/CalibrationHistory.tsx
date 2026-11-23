import { useMemo } from 'react'
import { codeLabel } from '../../constants/labels'
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../components/StatusBadge'
import type { NozzleCalibrationLog } from '../../api/calibrationApi'
import type { NozzleDetail } from '../../types/shift'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'
import { EmptyState } from '../../components/EmptyState'
import { fmtDate, fmtDateTime } from './calibrationFormat'
import type { CalibrationHistoryState } from './useCalibrationHistory'

interface CalibrationHistoryProps {
  history: CalibrationHistoryState
  nozzles: NozzleDetail[]
}

export function CalibrationHistory({ history, nozzles }: CalibrationHistoryProps) {
  const { t } = useTranslation(['calibration', 'common'])
  const {
    calibrationsPage, isLoading, filteredCalibrations,
    historyNozzleId, setHistoryNozzleId, setHistoryPage, setHistoryPageSize,
    fromDate, setFromDate, toDate, setToDate,
  } = history

  const historyNozzle = nozzles.find((n) => n.id === historyNozzleId)
  const nozzleMap = useMemo(
    () => new Map(nozzles.map((n) => [n.id, n])),
    [nozzles],
  )

  const hasActiveFilters = Boolean(fromDate || toDate || historyNozzleId)
  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setHistoryNozzleId(0)
    setHistoryPage(0)
  }

  return (
    <PageSection
      title={t('history.title')}
      titleMeta={historyNozzleId === 0 ? (
        <span className="text-sm text-ink-3">{t('history.allNozzlesSuffix')}</span>
      ) : historyNozzle ? (
        <span className="text-sm text-ink-3">
          {t('history.nozzleSuffix', { number: historyNozzle.nozzleNumber, fuel: codeLabel(historyNozzle.fuelType) })}
        </span>
      ) : null}
      flush
    >
      <FilterBar label={t('history.filtersLabel')} onClearFilters={clearFilters} hasActiveFilters={hasActiveFilters}>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t('common:fields.from')}
          <input
            type="date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setHistoryPage(0) }}
            className="min-w-[8.5rem] text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          {t('common:fields.to')}
          <input
            type="date"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setHistoryPage(0) }}
            className="min-w-[8.5rem] text-xs"
          />
        </label>
        <div className="w-full sm:w-56">
          <SearchableSelect label={t('history.filterLabel')}
            value={historyNozzleId ? historyNozzleId.toString() : ''}
            onChange={v => { setHistoryNozzleId(parseInt(v) || 0); setHistoryPage(0) }}
            placeholder={t('history.filterPlaceholder')}
            options={[
              { value: '', label: t('history.allNozzles') },
              ...nozzles.map((n) => ({
                value: n.id.toString(),
                label: t('nozzleOption', { number: n.nozzleNumber, fuel: codeLabel(n.fuelType) }),
              })),
            ]}
            size="sm"
          />
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonRows count={4} /></div>
      ) : filteredCalibrations.length === 0 ? (
        <EmptyState
          icon="generic"
          title={t('history.emptyTitle')}
          subtitle={
            fromDate || toDate
              ? t('history.emptyRange')
              : historyNozzleId
                ? t('history.emptyNozzle')
                : t('history.emptyFirst')
          }
        />
      ) : (
        <>
          <div className="ui-record-list">
            {filteredCalibrations.map((c: NozzleCalibrationLog) => {
              const nozzle = nozzleMap.get(c.nozzleId)
              return (
              <div key={c.id} className="ui-record-row">
                <div className="ui-record-row__main">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{fmtDate(c.calibrationDate)}</p>
                    <div className="ui-record-row__meta mt-0">
                      {t('history.nozzleNumber', { number: nozzle?.nozzleNumber ?? c.nozzleId })}
                      {nozzle?.fuelType ? ` · ${codeLabel(nozzle.fuelType)}` : ''}
                    </div>
                  </div>
                  {c.nextCalibrationDue && (
                    <StatusBadge tone="warn" icon={CalendarClock} label={t('history.nextDue', { date: fmtDate(c.nextCalibrationDue) })} />
                  )}
                </div>
                <div className="ui-record-row__meta">
                  {c.calibratedBy && <span>{t('history.by', { name: c.calibratedBy })}</span>}
                  {c.certificateReference && <span>{t('history.cert', { reference: c.certificateReference })}</span>}
                  <span className="text-ink-3">{t('history.loggedBy', { name: c.loggedByName })}</span>
                  <span className="text-ink-3">{t('history.loggedAt', { time: fmtDateTime(c.createdAt) })}</span>
                </div>
                {c.notes && <p className="text-xs text-ink-3">{c.notes}</p>}
                </div>
              </div>
            )})}
          </div>
          {calibrationsPage && (
            <div className="px-5">
              <Pagination
                data={calibrationsPage}
                onPageChange={p => setHistoryPage(p)}
                onPageSizeChange={s => { setHistoryPageSize(s); setHistoryPage(0) }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </>
      )}
    </PageSection>
  )
}
