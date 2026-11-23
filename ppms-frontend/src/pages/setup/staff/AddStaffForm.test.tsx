import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AddStaffForm } from './AddStaffForm'

vi.mock('../../../api/userApi', () => ({
  userApi: { createUser: vi.fn() },
}))

async function roleOptions(canAssignAdmin: boolean) {
  renderWithProviders(<AddStaffForm pumpId={2} canAssignAdmin={canAssignAdmin} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /^Role:/ }))
  const listbox = await screen.findByRole('listbox', { name: 'Role' })
  return Array.from(listbox.querySelectorAll('[role="option"]')).map((option) => option.textContent)
}

describe('AddStaffForm', () => {
  it('offers the Admin role to an owner', async () => {
    expect(await roleOptions(true)).toContain('Admin')
  })

  it('does not offer the Admin role to an admin, who may only add roles below their own', async () => {
    const options = await roleOptions(false)
    expect(options).not.toContain('Admin')
    expect(options).toEqual(expect.arrayContaining(['Operator', 'Manager', 'Accountant']))
  })
})
