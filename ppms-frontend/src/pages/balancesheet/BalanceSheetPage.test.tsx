import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import BalanceSheetPage from './BalanceSheetPage'

vi.mock('../../api/balanceSheetApi', () => ({ balanceSheetApi: { list: vi.fn(), getById: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getActive: vi.fn().mockResolvedValue([]) } }))
vi.mock('./DetailPanel', () => ({ DetailPanel: ({ reportId }: { reportId: number }) => <p>Detail of sheet {reportId}</p> }))

function sheet(id: number, stale = false): BalanceSheetSummary {
  return {
    id, reportType: 'DAY', reportDate: '2026-11-20', shiftWindow: null, periodLabel: `Day End ${id}`, periodLabelCode: null,
    periodLabelParams: {}, generatedByUserName: 'Owner', generatedAt: '2026-11-20T18:00:00Z', shiftCount: 2, totalLitresSold: 100,
    totalExpectedRevenue: 10_000, totalGrossProfit: 900, cashDiscrepancy: 0, stale, staleReason: null, staleReasonCode: null,
    staleReasonParams: {}, openShiftCount: 0,
  }
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

function renderPage(route = '/') {
  return renderWithProviders(<><BalanceSheetPage /><CurrentSearch /></>, { route })
}

describe('BalanceSheetPage', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(balanceSheetApi.list).mockResolvedValue({
      content: [sheet(7, true), sheet(8)], page: 0, pageSize: 10, totalElements: 2, totalPages: 1, hasNext: false, hasPrevious: false,
    })
  })

  it('shows the list beside a placeholder that offers to generate a sheet on desktop', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderPage()

    const list = screen.getByRole('navigation', { name: 'Balance sheets' })
    expect(await within(list).findByRole('link', { name: /Day End 7/ })).toBeInTheDocument()
    expect(within(list).getByText('Stale — regenerate')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Balance sheet filters' })).toContainElement(screen.getByLabelText('From date'))
    const detail = screen.getByRole('region', { name: 'Balance sheet details' })
    expect(within(detail).getByText('Select a sheet')).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: 'Generate sheet' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('action=generate-sheet')
    expect(await screen.findByRole('dialog', { name: /Generate balance sheet/ })).toBeInTheDocument()
  })

  it('opens the chosen sheet beside the list and keeps it in the address', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('link', { name: /Day End 8/ }))

    expect(screen.getByText('Detail of sheet 8')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Day End 8/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Balance sheets' })).toBeVisible()
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('sheet=8')
  })

  it('opens a sheet from a shared link even when it is not on the current page', async () => {
    setScreenWidth(1280)
    renderPage('/?sheet=42')

    expect(screen.getByText('Detail of sheet 42')).toBeInTheDocument()
  })

  it('uses two screens on a phone and goes back to the list', async () => {
    setScreenWidth(375)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('link', { name: /Day End 7/ }))

    expect(screen.getByText('Detail of sheet 7')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Balance sheets' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to list' }))

    expect(screen.getByRole('navigation', { name: 'Balance sheets' })).toBeInTheDocument()
    expect(screen.queryByText(/Detail of sheet/)).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('sheet=')
  })

  it('opens the Generate form from ?action=generate-sheet and closes it back out of the address', async () => {
    const user = userEvent.setup()
    renderPage('/?action=generate-sheet')

    const dialog = await screen.findByRole('dialog', { name: /Generate balance sheet/ })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('action=')
  })
})
