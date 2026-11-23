import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './DataTable'
import type { DataTableColumn } from './DataTable'

interface Sale { id: number; nozzle: string; amount: number }

const rows: Sale[] = [{ id: 1, nozzle: '#1 Petrol', amount: 500 }, { id: 2, nozzle: '#2 Diesel', amount: 300 }]

const columns: DataTableColumn<Sale>[] = [
  { key: 'nozzle', header: 'Nozzle', sortable: true, cell: (row) => row.nozzle },
  { key: 'amount', header: 'Amount', numeric: true, sortable: true, cell: (row) => row.amount },
]

describe('DataTable', () => {
  it('names the table and its scroll region by the caption', () => {
    render(<DataTable caption="Sales" captionHidden columns={columns} rows={rows} rowKey={(row) => row.id} />)
    expect(screen.getByRole('table', { name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sales' })).toHaveClass('ui-table-wrap')
    expect(screen.getByText('Sales')).toHaveClass('sr-only')
  })

  it('right-aligns numeric columns with tabular figures', () => {
    render(<DataTable caption="Sales" columns={columns} rows={rows} rowKey={(row) => row.id} />)
    expect(screen.getByRole('cell', { name: '500' })).toHaveClass('text-right', 'tabular-nums')
    expect(screen.getByRole('cell', { name: '#1 Petrol' })).toHaveClass('text-left')
  })

  it('marks the sorted column and asks the page to change the sort', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    render(
      <DataTable caption="Sales" columns={columns} rows={rows} rowKey={(row) => row.id}
        sort={{ key: 'amount', direction: 'desc' }} onSortChange={onSortChange} />,
    )
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: 'Nozzle' })).toHaveAttribute('aria-sort', 'none')
    await user.click(screen.getByRole('button', { name: 'Nozzle' }))
    expect(onSortChange).toHaveBeenCalledWith('nozzle')
  })

  it('leaves headers plain when the page does not sort', () => {
    render(<DataTable caption="Sales" columns={columns} rows={rows} rowKey={(row) => row.id} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Amount' })).not.toHaveAttribute('aria-sort')
  })

  it('shows the empty state, a totals row and custom rows', () => {
    const { rerender } = render(
      <DataTable caption="Sales" columns={columns} rows={[]} rowKey={(row) => row.id} empty={<p>No sales yet</p>} />,
    )
    expect(screen.getByText('No sales yet')).toBeInTheDocument()

    rerender(
      <DataTable caption="Sales" columns={columns} rows={rows} rowKey={(row) => row.id} cardsOnPhone scroll
        renderRow={(row) => <tr><td colSpan={2}>Custom {row.nozzle}</td></tr>}
        footer={<tr><th scope="row">Total</th><td>800</td></tr>} />,
    )
    expect(screen.getByText('Custom #2 Diesel')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table).toHaveClass('ui-table-cards')
    expect(screen.getByRole('region')).toHaveClass('ui-table-wrap--scroll')
    expect(within(table.querySelector('tfoot')!).getByRole('rowheader', { name: 'Total' })).toBeInTheDocument()
  })

  it('adds the row class to default rows and the column class to their cells', () => {
    const styledColumns: DataTableColumn<Sale>[] = [{ ...columns[0], className: 'font-medium' }, columns[1]]
    render(
      <DataTable caption="Sales" columns={styledColumns} rows={rows} rowKey={(row) => row.id}
        rowClassName={(row) => row.id === 2 ? 'bg-info-bg' : undefined} />,
    )
    expect(screen.getByRole('row', { name: /#2 Diesel/ })).toHaveClass('bg-info-bg')
    expect(screen.getByRole('row', { name: /#1 Petrol/ })).not.toHaveClass('bg-info-bg')
    expect(screen.getByRole('cell', { name: '#1 Petrol' })).toHaveClass('font-medium')
  })

  it('keeps a hidden header row available to screen readers', () => {
    render(<DataTable caption="Sales" headerHidden columns={columns} rows={rows} rowKey={(row) => row.id} />)
    expect(screen.getByRole('columnheader', { name: 'Nozzle' }).closest('thead')).toHaveClass('sr-only')
  })
})
