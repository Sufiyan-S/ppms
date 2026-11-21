import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useRowPanelFocus } from './useRowPanelFocus'

function Row() {
  const [panel, setPanel] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useRowPanelFocus(panel, panelRef, triggerRef)
  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setPanel('rates')}>Actions</button>
      <div ref={panelRef}>
        {panel && (
          <>
            <input aria-label="Daily rate" />
            <button type="button" onClick={() => setPanel(null)}>Done</button>
          </>
        )}
      </div>
    </>
  )
}

describe('useRowPanelFocus', () => {
  it('focuses the first field of the panel when it opens and the row button when it closes', async () => {
    render(<Row />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(screen.getByLabelText('Daily rate')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus()
  })
})
