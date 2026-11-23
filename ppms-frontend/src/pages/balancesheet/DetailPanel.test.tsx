import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import type { BalanceSheetDetail, BalanceSheetSummary } from '../../api/balanceSheetApi'
import { useAuthStore } from '../../store/authStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { DetailPanel } from './DetailPanel'
import { ReportListItem } from './ReportListItem'

vi.mock('../../api/balanceSheetApi', () => ({ balanceSheetApi: { getById: vi.fn(), regenerate: vi.fn() } }))

const summary: BalanceSheetSummary = {
  id: 7, reportType: 'DAY', reportDate: '2026-03-15', shiftWindow: null, periodLabel: 'Day End · 2026-03-15', periodLabelCode: 'PERIOD_DAY_END', periodLabelParams: { date: '2026-03-15' },
  generatedByUserName: 'Owner', generatedAt: '2026-03-15T18:00:00Z', shiftCount: 1, totalLitresSold: 20,
  totalExpectedRevenue: 2000, totalGrossProfit: 200, cashDiscrepancy: 0,
  stale: true, staleReason: 'Shift #11 was closed after this sheet was generated', staleReasonCode: 'STALE_SHIFT_CLOSED',
  staleReasonParams: { shiftId: 11 }, openShiftCount: 0,
}

const detail = {
  ...summary, pumpId: 3, notes: null,
  totalCashCollected: 2000, totalUpiCollected: 0, totalCardCollected: 0, totalFleetCardCollected: 0,
  totalCreditSold: 0, totalCreditRecovered: 0, totalCashRecovery: 0, totalLitresDelivered: 0, totalCostOfGoods: 1800,
  totalDipNetAmount: 0, totalNetProfit: 200, linesChangedSinceGenerated: false,
  fuelLines: [], shiftLines: [], meterAmendments: [], dipPlEntries: [],
  productSales: null, expenses: null, settlementSummary: null, includedShiftNames: [],
} as BalanceSheetDetail

function renderPanel(onRegenerated = vi.fn()) {
  renderWithProviders(
    <DetailPanel pumpId={3} reportId={7} onClose={vi.fn()} canDelete
      onDelete={vi.fn()} onRegenerated={onRegenerated} pumpName="Pump" />,
  )
}

describe('Balance sheet staleness', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    vi.mocked(balanceSheetApi.getById).mockResolvedValue(detail)
    vi.mocked(balanceSheetApi.regenerate).mockResolvedValue({ ...detail, id: 8, stale: false, staleReason: null })
  })

  it('marks a stale sheet in the list', () => {
    renderWithProviders(<ReportListItem report={summary} search="?sheet=7" isSelected={false} />)
    expect(screen.getByText('Stale — regenerate')).toBeInTheDocument()
  })

  it('explains why a sheet is stale and regenerates it into a new sheet', async () => {
    const user = userEvent.setup()
    const onRegenerated = vi.fn()
    renderPanel(onRegenerated)

    expect(await screen.findByText(/Shift #11 was closed after this sheet was generated/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    expect(balanceSheetApi.regenerate).toHaveBeenCalledWith(3, 7)
    await vi.waitFor(() => expect(onRegenerated).toHaveBeenCalledWith(8))
  })

  it('treats changed expense, product or dip lines as out of date too', async () => {
    vi.mocked(balanceSheetApi.getById).mockResolvedValue({ ...detail, stale: false, staleReason: null, linesChangedSinceGenerated: true })
    renderPanel()

    expect(await screen.findByText(/Expenses, product sales or dip entries for this day changed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  })

  it('says how many shifts were still open on a live sheet', async () => {
    vi.mocked(balanceSheetApi.getById).mockResolvedValue({ ...detail, stale: false, staleReason: null, openShiftCount: 2 })
    renderPanel()

    expect(await screen.findByText('2 shifts still open — this sheet covers only closed shifts.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument()
  })
})
