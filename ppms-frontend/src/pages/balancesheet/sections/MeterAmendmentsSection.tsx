import type { BalanceSheetDetail, MeterAmendmentLine } from '../../../api/balanceSheetApi'
import { Td, Th } from '../bsTableCells'
import { FUEL_BADGE, IST_TIME_FORMATTER } from '../bsFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

export function MeterAmendmentsSection({ detail }: { detail: BalanceSheetDetail }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Meter Reading Amendments
        <span className="ml-2 text-slate-500 normal-case font-normal">
          ({detail.meterAmendments.length} amendment{detail.meterAmendments.length !== 1 ? 's' : ''} during this period)
        </span>
      </h3>
      <ScrollRegion label="Meter amendments" className="ui-table-wrap overflow-x-auto border-amber-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-50 text-left">
              <Th>Fuel</Th>
              <Th>Type</Th>
              <Th right>Previous</Th>
              <Th right>New</Th>
              <Th right>Change</Th>
              <Th>Reason</Th>
              <Th>By</Th>
              <Th>Time</Th>
            </tr>
          </thead>
          <tbody>
            {detail.meterAmendments.map((a: MeterAmendmentLine) => {
              const badge = FUEL_BADGE[a.fuelType] ?? 'bg-slate-100 text-slate-600'
              const deltaColor = a.delta < 0 ? 'text-red-600' : a.delta > 0 ? 'text-amber-600' : 'text-slate-500'
              return (
                <tr key={a.id} className="border-t border-amber-100 hover:bg-amber-50 transition-colors">
                  <Td>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
                      {codeLabel(a.fuelType)}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-xs font-medium text-slate-600">
                      {a.adjustmentType === 'RESET' ? 'Reset to 0' : 'Custom'}
                    </span>
                  </Td>
                  <Td right><span className="font-mono text-slate-600">{a.previousReading.toFixed(2)}</span></Td>
                  <Td right><span className="font-mono text-slate-700 font-medium">{a.newReading.toFixed(2)}</span></Td>
                  <Td right>
                    <span className={`font-medium ${deltaColor}`}>
                      {a.delta > 0 ? '+' : ''}{a.delta.toFixed(2)}
                    </span>
                  </Td>
                  <Td><span className="text-xs text-slate-500">{a.reason}</span></Td>
                  <Td><span className="text-xs text-slate-500">{a.recordedByUserName}</span></Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {IST_TIME_FORMATTER.format(new Date(a.createdAt))}
                    </span>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </section>
  )
}
