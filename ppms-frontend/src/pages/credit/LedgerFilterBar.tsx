import type { FilterMode, LedgerFilters, TxTypeFilter } from './useLedgerFilters'

export function LedgerFilterBar({ filters }: { filters: LedgerFilters }) {
  const {
    filterMode, setFilterMode, txTypeFilter, setTxTypeFilter, availableMonths,
    selectedMonth, setSelectedMonth, fromDate, setFromDate, toDate, setToDate,
  } = filters

  return (
    <>
    {/* Filter toolbar */}
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Ledger History</h3>
      <div className="flex items-center gap-1 ml-auto bg-slate-100 rounded-lg p-0.5">
        {(['all', 'month', 'range'] as FilterMode[]).map(m => (
          <button
            key={m}
            onClick={() => setFilterMode(m)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filterMode === m
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m === 'all' ? 'All' : m === 'month' ? 'By Month' : 'Date Range'}
          </button>
        ))}
      </div>
    </div>
    {/* Transaction type filter */}
    <div className="flex items-center gap-2 mb-4">
      {([
        { value: 'ALL',      label: 'All Types',  color: 'slate' },
        { value: 'SALE',     label: '↑ Sales',    color: 'orange' },
        { value: 'PAYMENT',  label: '↓ Payments', color: 'green' },
        { value: 'INTEREST', label: '% Interest', color: 'purple' },
      ] as { value: TxTypeFilter; label: string; color: string }[]).map(({ value, label, color }) => (
        <button
          key={value}
          onClick={() => setTxTypeFilter(value)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            txTypeFilter === value
              ? color === 'slate'
                ? 'bg-slate-700 border-slate-700 text-white'
                : color === 'orange'
                ? 'bg-orange-100 border-orange-400 text-orange-700'
                : color === 'green'
                ? 'bg-green-100 border-green-400 text-green-700'
                : 'bg-purple-100 border-purple-400 text-purple-700'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>

    {/* Filter controls */}
    {filterMode === 'month' && (
      <div className="mb-4 flex flex-wrap gap-2">
        {availableMonths.length === 0 ? (
          <span className="text-xs text-slate-500">No transactions yet</span>
        ) : (
          availableMonths.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMonth(prev => prev === m ? '' : m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                selectedMonth === m
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
              }`}
            >
              {m}
            </button>
          ))
        )}
      </div>
    )}

    {filterMode === 'range' && (
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="credit-ledger-from" className="text-xs text-slate-500 whitespace-nowrap">From</label>
          <input id="credit-ledger-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="credit-ledger-to" className="text-xs text-slate-500 whitespace-nowrap">To</label>
          <input id="credit-ledger-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate('') }}
            className="text-xs text-slate-500 hover:text-slate-600">Clear</button>
        )}
      </div>
    )}
    </>
  )
}
