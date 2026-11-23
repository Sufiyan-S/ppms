import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { CreateShiftBatchForm } from './CreateShiftBatchForm'

vi.mock('../../../api/shiftDefinitionApi', () => ({
  shiftDefinitionApi: { createBatch: vi.fn() },
}))

async function pickTime(user: ReturnType<typeof userEvent.setup>, field: 'Start time' | 'End time', time: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${field}`) }))
  await user.click(await screen.findByRole('option', { name: time }))
}

describe('CreateShiftBatchForm', () => {
  it('shows how long each shift runs as the times change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateShiftBatchForm pumpId={2} onClose={vi.fn()} />)

    expect(screen.getByText('8h')).toBeInTheDocument()

    await pickTime(user, 'End time', '2:30 PM')
    expect(screen.getByText('8h 30m')).toBeInTheDocument()
  })

  it('flags a day shift that ends before it starts, and accepts it once ticked as Night', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateShiftBatchForm pumpId={2} onClose={vi.fn()} />)

    await pickTime(user, 'Start time', '9:00 PM')
    await pickTime(user, 'End time', '9:00 AM')
    expect(screen.getByText('Ends before it starts. Tick Night if it runs past midnight.')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Night' }))
    expect(screen.getByText('12h · ends next day')).toBeInTheDocument()
  })

  it('shows a missing start date under the start date field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CreateShiftBatchForm pumpId={2} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Save schedule' }))

    expect(screen.getByLabelText('Start date')).toHaveAccessibleDescription('Start date is required')
  })
})
