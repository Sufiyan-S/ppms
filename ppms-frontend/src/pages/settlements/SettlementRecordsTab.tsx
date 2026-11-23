import { Landmark, Check, AlertTriangle, Ban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DailySummaryEntry, Settlement, SettlementPaymentType } from '../../api/paymentSettlementApi'
import { CsvExportButton } from '../../components/CsvExportButton'
import { DatePresetChips } from '../../components/DatePresetChips'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { TYPE_ACCENT, TYPE_ICONS, fmtAmt, fmtDate, typeLabel } from './settlementFormat'
import type { SettlementHistory } from './useSettlementHistory'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'
import { RefreshIndicator } from '../../components/RefreshIndicator'

// The CSV is shared with accountants, so its headings and type names stay English whatever the screen language.
const CSV_TYPE_NAMES: Record<SettlementPaymentType, string> = { UPI: 'UPI', CARD: 'Card', FLEET_CARD: 'Fleet Card' }

const CSV_COLUMNS: CsvColumn<DailySummaryEntry>[] = [
  { header: 'Date', value: (row) => row.date, kind: 'date' },
  { header: 'UPI collected', value: (row) => row.upiCollected, kind: 'money' },
  { header: 'UPI settled', value: (row) => row.upiSettled, kind: 'money' },
  { header: 'Card collected', value: (row) => row.cardCollected, kind: 'money' },
  { header: 'Card settled', value: (row) => row.cardSettled, kind: 'money' },
  { header: 'Fleet card collected', value: (row) => row.fleetCardCollected, kind: 'money' },
  { header: 'Fleet card settled', value: (row) => row.fleetCardSettled, kind: 'money' },
  { header: 'Settlements recorded', value: (row) => row.settlements
    .map((s) => `${CSV_TYPE_NAMES[s.paymentType]} ${s.amountReceived.toFixed(2)}${s.voidStatus === 'VOIDED' ? ' (voided)' : ''}${s.bankReference ? ` ref ${s.bankReference}` : ''}`)
    .join('; ') },
]

interface SettlementRecordsTabProps {
  history: SettlementHistory
  canVoid: boolean
  onVoid: (settlement: Settlement) => void
  onOpenDetails: (settlement: Settlement) => void
}

export function SettlementRecordsTab({ history, canVoid, onVoid, onOpenDetails }: SettlementRecordsTabProps) {
  const { t } = useTranslation(['settlements', 'common'])
  const {
    filterFrom, setFilterFrom, filterTo, setFilterTo, typeFilter, setTypeFilter, setRange, loadAllDays,
    setSummaryPage, setSummaryPageSize, dailySummaryPage, dailySummary, loadingList, fetchingList, listUpdatedAt,
  } = history

  return (
    <PageSection
      title={t('page.historyTab')}
      titleMeta={<RefreshIndicator isFetching={fetchingList} dataUpdatedAt={listUpdatedAt ?? 0} />}
      actions={(
        <CsvExportButton
          filename={csvFilename('settlements', { from: filterFrom, to: filterTo })}
          columns={CSV_COLUMNS}
          rows={loadAllDays}
          disabled={dailySummary.length === 0}
        />
      )}
      flush
    >
      <FilterBar label={t('history.filtersLabel')}>
        <div className="basis-full">
          <DatePresetChips range={{ from: filterFrom, to: filterTo }} onSelect={setRange} />
        </div>
        <input aria-label={t('common:fields.fromDate')}
          type="date"
          value={filterFrom}
          max={filterTo}
          onChange={e => setFilterFrom(e.target.value)}
          className="flex-1 min-w-36 text-sm sm:w-40 sm:flex-none"
        />
        <span className="text-ink-3 text-sm">–</span>
        <input aria-label={t('common:fields.toDate')}
          type="date"
          value={filterTo}
          min={filterFrom}
          onChange={e => setFilterTo(e.target.value)}
          className="flex-1 min-w-36 text-sm sm:w-40 sm:flex-none"
        />
        <div className="w-full sm:w-40">
          <SearchableSelect label={t('history.typeFilter')}
            value={typeFilter}
            onChange={v => setTypeFilter(v as SettlementPaymentType | '')}
            options={[
              { value: '',           label: t('history.allTypes') },
              { value: 'UPI',        label: typeLabel('UPI') },
              { value: 'CARD',       label: typeLabel('CARD') },
              { value: 'FLEET_CARD', label: typeLabel('FLEET_CARD') },
            ]}
            size="sm"
          />
        </div>
      </FilterBar>

      {loadingList ? (
        <div className="px-5 py-4"><SkeletonRows count={5} /></div>
      ) : dailySummary.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-surface-sunken flex items-center justify-center mb-1"><Landmark size={26} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" /></div>
          <p className="font-semibold text-ink">{t('history.emptyTitle')}</p>
          <p className="text-sm text-ink-3 max-w-sm">
            {t('history.emptySubtitle')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {dailySummary.map(entry => {
            const visibleSettlements = typeFilter
              ? entry.settlements.filter(s => s.paymentType === typeFilter)
              : entry.settlements

            const collectedByType = ([
              { type: 'UPI',        collected: entry.upiCollected,        settled: entry.upiSettled        },
              { type: 'CARD',       collected: entry.cardCollected,       settled: entry.cardSettled       },
              { type: 'FLEET_CARD', collected: entry.fleetCardCollected,  settled: entry.fleetCardSettled  },
            ] as { type: SettlementPaymentType; collected: number; settled: number }[]).filter(r => typeFilter ? r.type === typeFilter : r.collected > 0 || r.settled > 0)

            if (collectedByType.length === 0 && visibleSettlements.length === 0) return null

            return (
              <div key={entry.date} className="px-5 py-4 space-y-3">
                {/* Date header */}
                <p className="text-sm font-bold text-ink">{fmtDate(entry.date)}</p>

                {/* Collected vs Settled per type */}
                {collectedByType.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {collectedByType.map(({ type, collected, settled }) => {
                      const accent   = TYPE_ACCENT[type]
                      const balance  = collected - settled
                      const balanced = balance <= 0
                      return (
                        <div key={type} className="rounded-control border border-border bg-bg px-3 py-2.5 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-badge ${accent.badge}`}>
                              {TYPE_ICONS[type]} {typeLabel(type)}
                            </span>
                            {balanced
                              ? <span className="inline-flex items-center gap-1 text-xs text-ok font-medium"><Check size={11} strokeWidth={2.5} aria-hidden="true" />{t('history.settled')}</span>
                              : <span className="text-xs text-warn font-medium">{t('wallet.inTransit')}</span>
                            }
                          </div>
                          <div className="flex justify-between text-xs text-ink-3 mt-0.5">
                            <span>{t('history.collected')}</span>
                            <MoneyText value={collected} className="font-semibold text-ink" />
                          </div>
                          <div className="flex justify-between text-xs text-ink-3">
                            <span>{t('history.settled')}</span>
                            <MoneyText value={settled} tone="ok" className="font-semibold" />
                          </div>
                          {!balanced && (
                            <div className="flex justify-between text-xs border-t border-dashed border-border pt-1 mt-0.5">
                              <span className="text-warn">{t('history.pending')}</span>
                              <MoneyText value={balance} tone="warn" className="font-bold" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Individual settlement records */}
                {visibleSettlements.length > 0 && (
                  <div className="space-y-1.5 pl-1">
                    {visibleSettlements.map(s => {
                      const accent    = TYPE_ACCENT[s.paymentType]
                      const isVoided  = s.voidStatus === 'VOIDED'
                      const shortfall = s.isPartial && s.pendingAtRecordTime != null
                        ? s.pendingAtRecordTime - s.amountReceived
                        : 0
                      return (
                        <div key={s.id} className={`flex flex-wrap items-start gap-x-3 gap-y-1 ${isVoided ? 'opacity-60' : ''}`}>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-badge flex-shrink-0 mt-0.5 ${accent.badge}`}>
                            {TYPE_ICONS[s.paymentType]} {typeLabel(s.paymentType)}
                          </span>
                          <div className="order-last basis-full min-w-0 sm:order-none sm:basis-0 sm:flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isVoided && (
                                <StatusBadge tone="bad" icon={Ban} label={t('history.voided')} />
                              )}
                              {!isVoided && s.isPartial && (
                                <StatusBadge tone="warn" icon={AlertTriangle} label={t('history.partialShort', { amount: fmtAmt(shortfall) })} />
                              )}
                              <span className="text-xs text-ink-3 truncate">
                                {s.notes ? `${s.notes} · ` : ''}{t('history.by', { name: s.recordedByUserName })}
                              </span>
                            </div>
                            {!isVoided && s.isPartial && s.pendingAtRecordTime != null && (
                              <p className="text-xs text-ink-3 mt-0.5">
                                {t('history.expectedReceived', { expected: fmtAmt(s.pendingAtRecordTime), received: fmtAmt(s.amountReceived) })}
                              </p>
                            )}
                            {isVoided && s.voidReason && (
                              <p className="text-xs text-bad mt-0.5">{t('history.voidReason', { reason: s.voidReason })}</p>
                            )}
                          </div>
                          <MoneyText
                            value={s.amountReceived}
                            showSign
                            className={`text-sm font-bold flex-shrink-0 ml-auto sm:ml-0 ${isVoided ? 'text-ink-3 line-through' : 'text-ok'}`}
                          />
                          <button
                            type="button"
                            onClick={() => onOpenDetails(s)}
                            aria-label={t('history.detailsOf', { type: typeLabel(s.paymentType), amount: fmtAmt(s.amountReceived) })}
                            className="ui-btn ui-btn-ghost ui-btn-compact flex-shrink-0"
                          >
                            {t('history.details')}
                          </button>
                          {canVoid && !isVoided && (
                            <button
                              type="button"
                              onClick={() => onVoid(s)}
                              className="ui-btn ui-btn-danger ui-btn-compact flex-shrink-0"
                            >
                              {t('history.void')}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {dailySummaryPage && dailySummaryPage.totalElements > 0 && (
        <div className="px-5 border-t border-border">
          <Pagination
            data={dailySummaryPage}
            onPageChange={p => setSummaryPage(p)}
            onPageSizeChange={s => { setSummaryPageSize(s); setSummaryPage(0) }}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      )}
    </PageSection>
  )
}
