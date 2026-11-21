import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RowActionMenu } from './RowActionMenu'

function Menu({ onEdit = vi.fn(), onDelete = vi.fn() }: { onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <RowActionMenu
        label="Row actions"
        open={open}
        onOpenChange={setOpen}
        triggerClassName=""
        menuClassName=""
        items={[
          { key: 'edit', label: 'Edit', description: 'Change it', icon: null, className: '', onSelect: onEdit },
          { key: 'delete', label: 'Delete', description: 'Remove it', icon: null, className: '', onSelect: onDelete },
        ]}
      />
      <p>Outside</p>
    </>
  )
}

describe('RowActionMenu', () => {
  it('opens a menu and moves focus to its first item', async () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Row actions' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Edit/ })).toHaveFocus()
  })

  it('moves between items with the arrow keys and wraps around', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: /Edit/ })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: /Delete/ })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the menu button', async () => {
    render(<Menu />)
    const trigger = screen.getByRole('button', { name: 'Row actions' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('runs the chosen action and closes', async () => {
    const onDelete = vi.fn()
    render(<Menu onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when clicking outside', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    await userEvent.click(screen.getByText('Outside'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
