import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import type { ShiftDefinition } from '../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { GenerateModal } from './GenerateModal'

vi.mock('../../api/balanceSheetApi', () => ({ balanceSheetApi: { generate: vi.fn() } }))
vi.mock('../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getActive: vi.fn() } }))

const morning = { id: 4, name: 'Morning', windowLabel: '6:00 AM – 2:00 PM' } as ShiftDefinition

describe('GenerateModal', () => {
  it('says which shift and day the sheet will cover as the choices change', async () => {
    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValue([morning])
    const user = userEvent.setup()
    renderWithProviders(<GenerateModal pumpId={3} onClose={vi.fn()} onGenerated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Business date'), { target: { value: '2026-11-20' } })
    await waitFor(() => expect(screen.getByLabelText('Covers')).toHaveTextContent(/Morning · 6:00 AM – 2:00 PM on .*20.*2026/))

    await user.click(screen.getByRole('button', { name: 'Day-end report' }))
    expect(screen.getByLabelText('Covers')).toHaveTextContent(/Whole day, .*20.*2026/)
  })

  it('keeps Generate disabled while the pump has no shifts set up', async () => {
    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValue([])
    renderWithProviders(<GenerateModal pumpId={3} onClose={vi.fn()} onGenerated={vi.fn()} />)

    expect(await screen.findByText(/No shift definitions configured/)).toBeInTheDocument()
    const generate = screen.getByRole('button', { name: 'Generate' })
    expect(generate).toBeDisabled()
    expect(generate).toHaveAccessibleDescription(/Still needed\s*Shift/)
  })
})
