import type { TFunction } from 'i18next'
import type { DataTableColumn } from '../../../components/DataTable'
import type { Shift } from '../../../types/shift'

/** Headers matching the cells HistoryRow renders. */
export function historyColumns(t: TFunction<'shifts'>): DataTableColumn<Shift>[] {
  return [
    { key: 'id', header: t('history.columns.id'), className: 'px-5 hidden md:table-cell' },
    { key: 'nozzle', header: t('history.columns.nozzle'), className: 'px-5' },
    { key: 'window', header: t('history.columns.shift'), className: 'px-5 hidden md:table-cell' },
    { key: 'operator', header: t('history.columns.operator'), className: 'px-5' },
    { key: 'date', header: t('history.columns.date'), className: 'px-5' },
    { key: 'amountDue', header: t('history.columns.amountDue'), numeric: true, className: 'px-5' },
    { key: 'status', header: t('history.columns.status'), className: 'px-5' },
    { key: 'discrepancy', header: t('history.columns.discrepancy'), align: 'right', className: 'px-5 hidden md:table-cell' },
    { key: 'actions', header: <span className="sr-only">{t('history.columns.actions')}</span>, align: 'right', className: 'px-4' },
  ]
}
