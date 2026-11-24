import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { SalesTab } from './SalesTab'
import { StockInTab } from './StockInTab'

vi.mock('../../api/ancillaryApi', () => ({
  ancillaryApi: { getSales: vi.fn(), getDeliveries: vi.fn() },
}))

const emptyPage = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 10 }

function renderSalesTab() {
  return renderWithProviders(
    <SalesTab pumpId={1} products={[]} isBackfilling={false} onBackfillClosed={vi.fn()} onRefresh={vi.fn()} />,
  )
}

function renderStockInTab() {
  return renderWithProviders(
    <StockInTab pumpId={1} products={[]} isManagerOrAbove isRecording={false} onRecordClosed={vi.fn()} onRefresh={vi.fn()} />,
  )
}

describe('SalesTab', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows a skeleton, not the empty state, while sales are loading', () => {
    vi.mocked(ancillaryApi.getSales).mockReturnValue(new Promise(() => {}))
    const { container } = renderSalesTab()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('No sales recorded yet')).not.toBeInTheDocument()
  })

  it('shows a load error with Retry instead of the empty state when sales fail to load', async () => {
    const user = userEvent.setup()
    vi.mocked(ancillaryApi.getSales).mockRejectedValueOnce(new Error('down')).mockResolvedValue(emptyPage as never)
    renderSalesTab()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('No sales recorded yet')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No sales recorded yet')).toBeInTheDocument()
    expect(ancillaryApi.getSales).toHaveBeenCalledTimes(2)
  })
})

describe('StockInTab', () => {
  beforeEach(() => vi.resetAllMocks())

  it('shows a skeleton, not the empty state, while deliveries are loading', () => {
    vi.mocked(ancillaryApi.getDeliveries).mockReturnValue(new Promise(() => {}))
    const { container } = renderStockInTab()
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('No deliveries recorded yet')).not.toBeInTheDocument()
  })

  it('shows a load error instead of the empty state when deliveries fail to load', async () => {
    vi.mocked(ancillaryApi.getDeliveries).mockRejectedValue(new Error('down'))
    renderStockInTab()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No deliveries recorded yet')).not.toBeInTheDocument()
  })
})
