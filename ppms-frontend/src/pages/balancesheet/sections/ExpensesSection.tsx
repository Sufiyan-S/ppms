import type { ExpenseSummary } from '../../../api/balanceSheetApi'
import { Td, Th } from '../bsTableCells'
import { fmtMoney } from '../bsFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

// ── Approved expenses section (DAY reports only) ────────────────────────────────

export function ExpensesSection({ expenses }: { expenses: ExpenseSummary }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Approved Expenses
        <span className="ml-2 text-slate-500 normal-case font-normal">
          ({expenses.lines.length} expense{expenses.lines.length !== 1 ? 's' : ''})
        </span>
      </h3>
      <ScrollRegion label="Expenses" className="rounded-xl border border-red-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-red-50 text-left">
              <Th>Category</Th>
              <Th>Description</Th>
              <Th>Recorded By</Th>
              <Th right>Amount</Th>
            </tr>
          </thead>
          <tbody>
            {expenses.lines.map(line => (
              <tr key={line.id} className="border-t border-red-100 hover:bg-red-50 transition-colors">
                <Td>
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                    {codeLabel(line.category)}
                  </span>
                </Td>
                <Td><span className="text-xs text-slate-500">{line.description}</span></Td>
                <Td><span className="text-xs text-slate-500">{line.recordedByName}</span></Td>
                <Td right>
                  <span className="font-medium text-red-600">{fmtMoney(line.amount)}</span>
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-red-50 font-semibold border-t border-red-200">
              <Td colSpan={3}>Total Expenses</Td>
              <Td right>
                <span className="text-red-600">{fmtMoney(expenses.totalAmount)}</span>
              </Td>
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
    </section>
  )
}
