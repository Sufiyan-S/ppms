import { useState } from 'react'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { InterestAccrualReport } from '../../../api/reportApi'
import { DateRangeInputs, ErrorBox, SummaryCard } from '../shared'
import { fmtAmt, fmtShortDate, todayIso, yesterdayIso } from '../reportFormat'

// ── Interest Accrual Tab ───────────────────────────────────────────────────────

export function InterestAccrualTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(() => ({ from: yesterdayIso(), to: todayIso() }))

  const { data, isFetching, error } = useQuery<InterestAccrualReport>({
    queryKey: ['report-interest', pumpId, query?.from, query?.to],
    queryFn:  () => reportApi.getInterestAccrual(pumpId, query!.from, query!.to),
    enabled:  !!query,
  })

  return (
    <div className="space-y-4">
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
          <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <button
            onClick={() => setQuery({ from, to })}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? 'Loading…' : 'Generate'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data || data.clients.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            Print PDF
          </button>
        </div>
      </div>

      {error && <ErrorBox message={serverMessage(error) ?? 'Failed to load report'} />}

      {data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Total Charges"  value={String(data.totalCharges)}  color="text-slate-800" />
            <SummaryCard label="Total Interest" value={fmtAmt(data.totalInterest)} color="text-red-600" />
            <SummaryCard label="Clients"        value={String(data.clients.length)} color="text-slate-800" />
          </div>

          {data.clients.length === 0 ? (
            <p className="ui-empty py-8">No interest charges found for this period.</p>
          ) : (
            data.clients.map(client => (
              <div key={client.clientId} className="ui-card p-0 overflow-hidden">
                {/* Client header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{client.clientName}</p>
                    <p className="text-xs text-slate-500">{client.chargeCount} charge{client.chargeCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600">{fmtAmt(client.totalInterest)}</span>
                </div>

                {/* Charge lines */}
                <div className="divide-y divide-slate-100 text-xs">
                  {client.charges.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="text-slate-500 space-y-0.5">
                        <p>{fmtShortDate(c.periodFrom)} – {fmtShortDate(c.periodTo)} ({c.daysApplied} days)</p>
                        <p>Balance {fmtAmt(c.outstandingBalance)} @ {c.rateApplied}%/month · {c.source}</p>
                      </div>
                      <span className="font-medium text-slate-700 flex-shrink-0">{fmtAmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
