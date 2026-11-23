import { Fragment } from 'react'
import type { Key, ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { ScrollRegion } from './ScrollRegion'

export type SortDirection = 'asc' | 'desc'

export interface DataTableColumn<Row> {
  key: string
  header: ReactNode
  /** Right-aligned with tabular figures, for amounts and quantities. */
  numeric?: boolean
  align?: 'left' | 'right'
  sortable?: boolean
  /** Added to the header and every cell of the column, e.g. 'hidden md:table-cell'. */
  className?: string
  cell?: (row: Row) => ReactNode
}

export interface DataTableSort {
  key: string
  direction: SortDirection
}

interface DataTableProps<Row> {
  /** Names the table for screen readers; shown above it unless captionHidden. */
  caption: string
  captionHidden?: boolean
  /** The header row stays for screen readers but is not shown, for tables stacked under one visible header. */
  headerHidden?: boolean
  /** Name of the scrollable region; defaults to the caption. */
  regionLabel?: string
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => Key
  /** Replaces the default one-row-per-item rendering, for rows that need extra rows or custom markup. */
  renderRow?: (row: Row) => ReactNode
  /** Added to a default row, e.g. to highlight the selected one. */
  rowClassName?: (row: Row) => string | undefined
  sort?: DataTableSort
  onSortChange?: (key: string) => void
  /** Cells of a totals row, rendered in tfoot. */
  footer?: ReactNode
  /** Shown in place of the body when there are no rows. */
  empty?: ReactNode
  /** Long tables scroll inside the card with the header row kept in view. */
  scroll?: boolean
  /** Rows become stacked cards on phones. */
  cardsOnPhone?: boolean
  className?: string
  tableClassName?: string
}

function alignClass<Row>(column: DataTableColumn<Row>) {
  const right = column.numeric || column.align === 'right'
  return `${right ? 'text-right' : 'text-left'} ${column.numeric ? 'tabular-nums' : ''} ${column.className ?? ''}`
}

const ARIA_SORT: Record<SortDirection, 'ascending' | 'descending'> = { asc: 'ascending', desc: 'descending' }

function SortIcon({ direction }: { direction: SortDirection | undefined }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
  return <Icon size={12} strokeWidth={2.25} aria-hidden="true" className={direction ? '' : 'text-ink-3'} />
}

/** A table with the shared look: sticky header, numeric alignment, optional sorting, totals and phone cards. */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  headerHidden = false,
  regionLabel,
  columns,
  rows,
  rowKey,
  renderRow,
  rowClassName,
  sort,
  onSortChange,
  footer,
  empty,
  scroll = false,
  cardsOnPhone = false,
  className = '',
  tableClassName = '',
}: DataTableProps<Row>) {
  return (
    <ScrollRegion label={regionLabel ?? caption} className={`ui-table-wrap ${scroll ? 'ui-table-wrap--scroll' : ''} ${className}`}>
      <table className={`text-sm ${cardsOnPhone ? 'ui-table-cards' : ''} ${tableClassName}`}>
        <caption className={captionHidden ? 'sr-only' : 'px-4 py-2 text-left text-sm font-semibold text-ink'}>{caption}</caption>
        <thead className={headerHidden ? 'sr-only' : undefined}>
          <tr>
            {columns.map((column) => {
              const direction = sort?.key === column.key ? sort.direction : undefined
              const sortable = column.sortable && onSortChange
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sortable ? (direction ? ARIA_SORT[direction] : 'none') : undefined}
                  className={alignClass(column)}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className={`inline-flex items-center gap-1 font-medium hover:text-ink ${column.numeric || column.align === 'right' ? 'flex-row-reverse' : ''}`}
                    >
                      {column.header}
                      <SortIcon direction={direction} />
                    </button>
                  ) : column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : rows.map((row) => renderRow ? (
            <Fragment key={rowKey(row)}>{renderRow(row)}</Fragment>
          ) : (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((column) => (
                <td key={column.key} className={alignClass(column)}>{column.cell?.(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot className="border-t border-border font-semibold">{footer}</tfoot>}
      </table>
    </ScrollRegion>
  )
}
