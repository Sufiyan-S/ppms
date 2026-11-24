import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Tanker } from '../../../api/tankerApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { TankerCard } from './TankerCard'

const tanker: Tanker = {
  id: 4, pumpId: 2, name: 'HP Tanker 12', capacityLitres: 12000.4, tankerType: 'COMPANY',
  defaultTanker: false, active: true, createdAt: '2026-01-01T00:00:00Z',
}

function renderCard(shown: Tanker, handlers = { onEdit: vi.fn(), onMakeDefault: vi.fn(), onRemove: vi.fn() }) {
  renderWithProviders(<TankerCard tanker={shown} actionsDisabled={false} {...handlers} />)
  return handlers
}

describe('TankerCard', () => {
  it('shows the name, the capacity in whole litres and the tanker type', () => {
    renderCard(tanker)
    const card = screen.getByRole('article', { name: 'HP Tanker 12' })
    expect(within(card).getByRole('heading', { name: 'HP Tanker 12' })).toBeInTheDocument()
    expect(within(card).getByText('12,000 L')).toBeInTheDocument()
    expect(within(card).getByText('Company')).toBeInTheDocument()
    expect(within(card).queryByText('Default')).not.toBeInTheDocument()
  })

  it('marks the default tanker and offers no Make default on it', () => {
    renderCard({ ...tanker, defaultTanker: true })
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make default' })).not.toBeInTheDocument()
  })

  it('edits, makes default and removes after confirming', async () => {
    const user = userEvent.setup()
    const handlers = renderCard(tanker)

    await user.click(screen.getByRole('button', { name: 'Edit tanker HP Tanker 12' }))
    expect(handlers.onEdit).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Make default' }))
    expect(handlers.onMakeDefault).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove tanker HP Tanker 12' }))
    expect(handlers.onRemove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Yes/ }))
    expect(handlers.onRemove).toHaveBeenCalled()
  })
})
