import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePumpStore } from '../../../store/usePumpStore'
import { RouteOutlet } from './RouteOutlet'

function ClientPicker() {
  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  return selectedClient
    ? <p>Showing {selectedClient}</p>
    : <button type="button" onClick={() => setSelectedClient('Acme')}>Open Acme</button>
}

function renderCreditRoute() {
  render(
    <MemoryRouter initialEntries={['/dashboard/credit']}>
      <Routes>
        <Route path="/dashboard" element={<RouteOutlet />}>
          <Route path="credit" element={<ClientPicker />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RouteOutlet', () => {
  beforeEach(() => usePumpStore.setState({ selectedPumpId: 1 }))

  it('drops the open page state when the selected pump changes', async () => {
    renderCreditRoute()
    await userEvent.click(screen.getByRole('button', { name: 'Open Acme' }))
    expect(screen.getByText('Showing Acme')).toBeInTheDocument()

    act(() => usePumpStore.getState().setSelectedPumpId(2))

    expect(screen.queryByText('Showing Acme')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Acme' })).toBeInTheDocument()
  })

  it('keeps page state while the pump stays the same', async () => {
    renderCreditRoute()
    await userEvent.click(screen.getByRole('button', { name: 'Open Acme' }))
    act(() => usePumpStore.getState().setSelectedPumpId(1))
    expect(screen.getByText('Showing Acme')).toBeInTheDocument()
  })
})
