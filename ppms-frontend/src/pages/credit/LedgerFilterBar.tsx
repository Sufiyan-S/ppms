import { useTranslation } from 'react-i18next'
import type { FilterMode, LedgerFilters, TxTypeFilter } from './useLedgerFilters'
import type { MergedTx } from './ledgerGroups'
import { CsvExportButton } from '../../components/CsvExportButton'
import { FilterBar } from '../../components/layout/FilterBar'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { codeLabel } from '../../constants/labels'

// Column headers stay English: accountants pass these files on to their CA as they are.
const LEDGER_COLUMNS: CsvColumn<MergedTx>[] = [
  { header: 'Date', value: (row) => row.businessDate, kind: 'date' },
  { header: 'Account', value: (row) => row.subAccountName ?? row.clientName },
  { header: 'Type', value: (row) => codeLabel(row.type) },
  { header: 'Reference', value: (row) => row.reference },
  { header: 'Detail', value: (row) => row.detail },
  { header: 'Amount', value: (row) => row.amount, kind: 'money' },
  { header: 'Running balance', value: (row) => row.runningBalance, kind: 'money' },
  { header: 'Status', value: (row) => codeLabel(row.status) },
  { header: 'Counted in balance', value: (row) => (row.countedInBalance ? 'Yes' : 'No') },
]

const FILTER_MODES: FilterMode[] = ['all', 'month', 'range']
/** Each label is credit.json ledger.typeFilters.<value>. */
const TX_TYPE_FILTERS: TxTypeFilter[] = ['ALL', 'SALE', 'PAYMENT', 'INTEREST']

export function LedgerFilterBar({ filters }: { filters: LedgerFilters }) {
  const { t } = useTranslation(['credit', 'common'])
  const {
    filterMode, setFilterMode, txTypeFilter, setTxTypeFilter, availableMonths,
    selectedMonth, setSelectedMonth, fromDate, setFromDate, toDate, setToDate, filtered,
  } = filters
  const exportRange = filterMode === 'range' ? { from: fromDate, to: toDate } : undefined

  return (
    <div className="mb-4 overflow-hidden rounded-card border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <h3 className="text-sm font-semibold text-ink-2">{t('ledger.history')}</h3>
        <CsvExportButton
          filename={csvFilename(filterMode === 'month' && selectedMonth ? `credit-ledger-${selectedMonth}` : 'credit-ledger', exportRange)}
          columns={LEDGER_COLUMNS}
          rows={filtered}
        />
      </div>
      <FilterBar label={t('ledger.filtersLabel')} className="border-b-0 border-t border-border">
        <div className="ui-chip-row">
          {FILTER_MODES.map(mode => (
            <button key={mode} type="button" aria-pressed={filterMode === mode} onClick={() => setFilterMode(mode)} className="ui-chip">
              {t(`ledger.modes.${mode}`)}
            </button>
          ))}
        </div>
        <div className="ui-chip-row">
          {TX_TYPE_FILTERS.map(value => (
            <button key={value} type="button" aria-pressed={txTypeFilter === value} onClick={() => setTxTypeFilter(value)} className="ui-chip">
              {t(`ledger.typeFilters.${value}`)}
            </button>
          ))}
        </div>

        {filterMode === 'month' && (
          availableMonths.length === 0 ? (
            <span className="text-xs text-ink-3">{t('ledger.noTransactions')}</span>
          ) : (
            <div className="ui-chip-row basis-full">
              {availableMonths.map(month => (
                <button key={month} type="button" aria-pressed={selectedMonth === month}
                  onClick={() => setSelectedMonth(previous => previous === month ? '' : month)} className="ui-chip">
                  {month}
                </button>
              ))}
            </div>
          )
        )}

        {filterMode === 'range' && (
          <div className="flex basis-full flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="credit-ledger-from" className="text-xs text-ink-3 whitespace-nowrap">{t('common:fields.from')}</label>
              <input id="credit-ledger-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="credit-ledger-to" className="text-xs text-ink-3 whitespace-nowrap">{t('common:fields.to')}</label>
              <input id="credit-ledger-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="text-sm" />
            </div>
            {(fromDate || toDate) && (
              <button type="button" onClick={() => { setFromDate(''); setToDate('') }} className="ui-btn ui-btn-ghost ui-btn-compact">
                {t('common:actions.clear')}
              </button>
            )}
          </div>
        )}
      </FilterBar>
    </div>
  )
}
