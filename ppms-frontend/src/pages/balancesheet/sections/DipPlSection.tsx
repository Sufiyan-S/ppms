import type { BalanceSheetDetail, DipPlLine } from '../../../api/balanceSheetApi'
import { Td, Th } from '../bsTableCells'
import { FUEL_BADGE, IST_TIME_FORMATTER, fmtMoney } from '../bsFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

export function DipPlSection({ detail }: { detail: BalanceSheetDetail }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Dip P/L
        <span className="ml-2 text-slate-500 normal-case font-normal">
          ({detail.dipPlEntries.length} entr{detail.dipPlEntries.length !== 1 ? 'ies' : 'y'})
        </span>
      </h3>
      <ScrollRegion label="Dip profit and loss" className="ui-table-wrap overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left">
              <Th>Type</Th>
              <Th>Fuel</Th>
              <Th right>Litres</Th>
              <Th right>P/L</Th>
              <Th>Time</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {detail.dipPlEntries.map((entry: DipPlLine, idx: number) => {
              const badge = FUEL_BADGE[entry.fuelType] ?? 'bg-slate-100 text-slate-600'
              const isGain = entry.monetaryAmount > 0
              const isLoss = entry.monetaryAmount < 0
              const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-500'
              const litresColor = entry.type === 'DIP_CHECK'
                ? (entry.litres > 0 ? 'text-emerald-600' : entry.litres < 0 ? 'text-red-600' : 'text-slate-500')
                : 'text-slate-700'
              return (
                <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <Td>
                    {entry.type === 'DIP_CHECK' ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        Dip Check
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                        Maintenance
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
                      {codeLabel(entry.fuelType)}
                    </span>
                  </Td>
                  <Td right>
                    <span className={`font-mono ${litresColor}`}>
                      {entry.type === 'DIP_CHECK' && entry.litres > 0 ? '+' : ''}{entry.litres.toFixed(2)} L
                    </span>
                  </Td>
                  <Td right>
                    <span className={`font-medium ${plColor}`}>
                      {isGain ? '+' : ''}{fmtMoney(entry.monetaryAmount)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {IST_TIME_FORMATTER.format(new Date(entry.recordedAt))}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500 max-w-[160px] truncate block" title={entry.notes ?? ''}>
                      {entry.notes ?? '—'}
                    </span>
                  </Td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold border-t border-slate-200">
              <Td colSpan={3}>Net Dip P/L</Td>
              <Td right>
                {(() => {
                  const net = detail.totalDipNetAmount
                  const color = net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-600' : 'text-slate-500'
                  return (
                    <span className={color}>
                      {net > 0 ? '+' : ''}{fmtMoney(net)}
                    </span>
                  )
                })()}
              </Td>
              <Td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
    </section>
  )
}
