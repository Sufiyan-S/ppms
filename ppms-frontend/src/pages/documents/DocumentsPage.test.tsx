import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { documentApi } from '../../api/documentApi'
import type { DocumentStatus, PumpDocument } from '../../api/documentApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import DocumentsPage from './DocumentsPage'

vi.mock('../../api/documentApi', () => ({ documentApi: { getDocuments: vi.fn() } }))

function document(id: number, name: string, status: DocumentStatus): PumpDocument {
  return { id, pumpId: 4, name, docType: 'Licence', status, expiryDate: null, notes: null, createdAt: '', updatedAt: '' }
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

describe('DocumentsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: 4 }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 4 })
    vi.mocked(documentApi.getDocuments).mockResolvedValue([
      document(1, 'Explosives Licence', 'EXPIRED'),
      document(2, 'Trade Licence', 'VALID'),
    ])
  })

  it('heads the page with the document count and the Add document action', async () => {
    renderWithProviders(<DocumentsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Compliance Documents' })).toBeInTheDocument()
    expect(await screen.findByText('2 documents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add document' })).toBeInTheDocument()
  })

  it('filters by status from the address and clears the filter', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><DocumentsPage /><CurrentSearch /></>, { route: '/dashboard/documents?status=EXPIRED' })

    expect(await screen.findByText('Explosives Licence')).toBeInTheDocument()
    expect(screen.queryByText('Trade Licence')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Document filters' })).toHaveTextContent('Showing 1 of 2')
    expect(screen.getByRole('button', { name: 'Expired' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByText('Trade Licence')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('status=')
  })

  it('opens the form on the name field and says under each field what is missing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DocumentsPage />)

    await user.click(await screen.findByRole('button', { name: 'Add document' }))
    const name = screen.getByLabelText('Document name')
    expect(name).toHaveFocus()
    await user.type(name, ' ')
    await user.type(screen.getByLabelText('Document type'), ' ')
    await user.click(screen.getAllByRole('button', { name: 'Add document' }).at(-1)!)

    expect(name).toHaveAccessibleDescription('Enter the document name')
    expect(screen.getByLabelText('Document type')).toHaveAccessibleDescription(/For example licence, certificate or permit\s*Enter the document type/)
  })
})
