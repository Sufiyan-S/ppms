import { Check } from 'lucide-react'
import type { SettlementSummary } from '../../../api/balanceSheetApi'
import { Td, Th } from '../bsTableCells'
import { fmtMoney } from '../bsFormat'

// ── Payment settlement section (DAY reports only) ──────────────────────────────

export function SettlementSection({ summary }: { summary: SettlementSummary }) {
  const TYPE_LABELS: Record<string, string> = { UPI: 'UPI', CARD: 'Card', FLEET_CARD: 'Fleet Card' }

  const rows = [
    { type: 'UPI',        settled: summary.upiSettledOnDate,        pending: summary.walletUpiPending },
    { type: 'CARD',       settled: summary.cardSettledOnDate,        pending: summary.walletCardPending },
    { type: 'FLEET_CARD', settled: summary.fleetCardSettledOnDate,   pending: summary.walletFleetCardPending },
  ]

  const totalSettled = rows.reduce((s, r) => s + r.settled, 0)
  const totalPending = rows.reduce((s, r) => s + r.pending, 0)

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
        Digital Payment Settlements
      </h3>
      <div className="border border-slate-200 rounded-lg overflow-hidden text-sm">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <Th>Payment Type</Th>
              <Th right>Settled on this Date</Th>
              <Th right>Cumulative Wallet Pending</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.type} className="border-t border-slate-100">
                <Td>{TYPE_LABELS[r.type]}</Td>
                <Td right>
                  {r.settled > 0
                    ? <span className="text-emerald-600 font-medium">{fmtMoney(r.settled)}</span>
                    : <span className="text-slate-500">—</span>
                  }
                </Td>
                <Td right>
                  {r.pending !== 0
                    ? <span className={r.pending > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>{fmtMoney(r.pending)}</span>
                    : <span className="inline-flex items-center gap-1 text-slate-500">Settled<Check size={11} strokeWidth={2.5} /></span>
                  }
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold border-t border-slate-200">
              <Td>Total</Td>
              <Td right>{totalSettled > 0 ? fmtMoney(totalSettled) : '—'}</Td>
              <Td right>
                <span className={totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  {fmtMoney(totalPending)}
                </span>
              </Td>
            </tr>
          </tfoot>
        </table>
        {summary.settlementsOnDate.length > 0 && (
          <div className="border-t border-slate-200 p-3 bg-slate-50">
            <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Recorded on this date</p>
            <div className="space-y-1">
              {summary.settlementsOnDate.map(s => (
                <div key={s.id} className="flex items-center gap-3 text-xs text-slate-600">
                  <span className="font-medium">{TYPE_LABELS[s.paymentType]}</span>
                  <span className="text-emerald-700 font-mono font-semibold">{fmtMoney(s.amountReceived)}</span>
                  {s.notes && <span className="text-slate-500">· {s.notes}</span>}
                  <span className="text-slate-500 ml-auto">by {s.recordedByUserName}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
