import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StaffMember } from '../../../api/userApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { StaffRow } from './StaffRow'

const member: StaffMember = {
  id: 11, employeeId: 'EMP-11', fullName: 'Ravi Kumar', phoneNumber: '9876543210', gender: 'MALE',
  nightShiftConsent: true, role: 'OPERATOR', assignedPumpId: 2, status: 'ACTIVE',
  dailyRate: null, shift1HourlyRate: 60, standardHourlyRate: 50,
}

function renderRow(shown: StaffMember, isOwnerOrAdmin: boolean) {
  return renderWithProviders(
    <StaffRow
      pumpId={2} member={shown} isOwner={isOwnerOrAdmin} isOwnerOrAdmin={isOwnerOrAdmin} activeShiftDefs={[]}
      openPanel={null} onOpenPanel={vi.fn()} onClosePanel={vi.fn()}
      menuOpen={false} onMenuChange={vi.fn()} statusPending={false} onToggleStatus={vi.fn()}
    />,
  )
}

describe('StaffRow', () => {
  it('shows the phone number to a viewer the server sent it to', () => {
    renderRow(member, true)
    expect(screen.getByText('9876543210')).toBeInTheDocument()
  })

  it('leaves no blank slot when the server withholds the phone and pay rates', () => {
    const { container } = renderRow(
      { ...member, phoneNumber: null, shift1HourlyRate: null, standardHourlyRate: null }, false,
    )
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument()
    expect(screen.getByText('EMP-11')).toBeInTheDocument()
    expect(container.querySelectorAll('span:empty')).toHaveLength(0)
    expect(screen.queryByText(/not set/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Staff actions' })).not.toBeInTheDocument()
  })
})
