import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { pageSlice } from '../utils/pageSlice'
import { Pagination } from './Pagination'

const items = (count: number) => Array.from({ length: count }, (_, i) => i)

function renderPagination(count: number, page: number, pageSize = 10) {
  const onPageChange = vi.fn()
  const onPageSizeChange = vi.fn()
  render(<Pagination data={pageSlice(items(count), page, pageSize)} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />)
  return { onPageChange, onPageSizeChange }
}

function pageButtons() {
  return screen.getAllByRole('button').filter(b => /^\d+$/.test(b.textContent ?? '')).map(b => b.textContent)
}

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(<Pagination data={pageSlice(items(5), 0, 10)} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the visible range and disables Previous on the first page', () => {
    renderPagination(25, 0)
    expect(screen.getByText('1–10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows a short last page and disables Next', () => {
    renderPagination(25, 2)
    expect(screen.getByText('21–25')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('moves to the next, previous and chosen page', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPagination(25, 1)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await user.click(screen.getByRole('button', { name: '3' }))
    expect(onPageChange.mock.calls).toEqual([[2], [0], [2]])
  })

  it('shortens long page lists with ellipses around the current page', () => {
    renderPagination(200, 10)
    expect(pageButtons()).toEqual(['1', '9', '10', '11', '12', '13', '20'])
    expect(screen.getAllByText('…')).toHaveLength(2)
  })

  it('shows every page for seven pages or fewer', () => {
    renderPagination(70, 3)
    expect(pageButtons()).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })

  it('changes page size and resets to the first page', async () => {
    const user = userEvent.setup()
    const { onPageChange, onPageSizeChange } = renderPagination(25, 2)
    const select = screen.getByLabelText('Rows per page')
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['10', '20', '50'])
    await user.selectOptions(select, '20')
    expect(onPageSizeChange).toHaveBeenCalledWith(20)
    expect(onPageChange).toHaveBeenCalledWith(0)
  })
})
