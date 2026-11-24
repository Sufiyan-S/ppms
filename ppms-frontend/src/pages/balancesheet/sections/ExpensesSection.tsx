import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ExpenseSummary } from '../../../api/balanceSheetApi'
import { Td } from '../bsTableCells'
import { bsColumn } from '../bsFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { MoneyText } from '../../../components/AmountText'
import { codeLabel } from '../../../constants/labels'

type ExpenseLine = ExpenseSummary['lines'][number]

function expenseColumns(t: TFunction<'balancesheet'>): DataTableColumn<ExpenseLine>[] {
  return [
    bsColumn('category', t('columns.category')),
    bsColumn('description', t('columns.description')),
    bsColumn('recordedBy', t('columns.recordedBy')),
    bsColumn('amount', t('columns.amount'), true),
  ]
}

// ── Approved expenses section (DAY reports only) ────────────────────────────────

export function ExpensesSection({ expenses }: { expenses: ExpenseSummary }) {
  const { t } = useTranslation('balancesheet')
  return (
    <section>
      <h3 className="ui-section-heading mb-3">
        {t('expenses.title')}
        <span className="ml-2 font-normal text-ink-3">
          {t('expenses.count', { count: expenses.lines.length })}
        </span>
      </h3>
      <DataTable
        caption={t('expenses.caption')}
        captionHidden
        regionLabel={t('expenses.region')}
        columns={expenseColumns(t)}
        rows={expenses.lines}
        rowKey={(line) => line.id}
        renderRow={(line) => (
          <tr>
            <Td><StatusBadge tone="neutral" label={codeLabel(line.category)} /></Td>
            <Td><span className="text-xs text-ink-3">{line.description}</span></Td>
            <Td><span className="text-xs text-ink-3">{line.recordedByName}</span></Td>
            <Td right><MoneyText value={line.amount} tone="bad" className="font-medium" /></Td>
          </tr>
        )}
        footer={
          <tr className="bg-surface-sunken">
            <Td colSpan={3}>{t('expenses.total')}</Td>
            <Td right><MoneyText value={expenses.totalAmount} tone="bad" /></Td>
          </tr>
        }
      />
    </section>
  )
}
