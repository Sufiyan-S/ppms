import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchableSelect } from './SearchableSelect'
import type { SelectOption } from './SearchableSelect'

const fuels: SelectOption[] = [
  { value: 'PETROL', label: 'Petrol' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'CNG', label: 'CNG' },
]

function Controlled({ options = fuels, onChange = vi.fn() }: { options?: SelectOption[]; onChange?: (v: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <SearchableSelect
      label="Fuel"
      value={value}
      options={options}
      onChange={(v) => { setValue(v); onChange(v) }}
    />
  )
}

describe('SearchableSelect', () => {
  it('names the trigger with its label and the current choice', () => {
    render(<Controlled />)
    expect(screen.getByRole('button', { name: 'Fuel: Select…' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens with the arrow key and selects with Down then Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    screen.getByRole('button', { name: /Fuel/ }).focus()

    await user.keyboard('{ArrowDown}')
    const listbox = await screen.findByRole('listbox', { name: 'Fuel' })
    await vi.waitFor(() => expect(listbox).toHaveFocus())

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}')
    expect(onChange).toHaveBeenCalledWith('DIESEL')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fuel: Diesel' })).toHaveFocus()
  })

  it('marks the active option on the listbox while moving with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    screen.getByRole('button', { name: /Fuel/ }).focus()
    await user.keyboard('{ArrowDown}')
    const listbox = await screen.findByRole('listbox')
    await vi.waitFor(() => expect(listbox).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    const active = screen.getByRole('option', { name: 'Diesel' })
    expect(listbox).toHaveAttribute('aria-activedescendant', active.id)
  })

  it('closes on Escape without choosing and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: /Fuel/ })
    await user.click(trigger)
    const listbox = await screen.findByRole('listbox')
    await vi.waitFor(() => expect(listbox).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('selects an option on click and marks it selected next time', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    await user.click(screen.getByRole('option', { name: 'CNG' }))
    expect(screen.getByRole('button', { name: 'Fuel: CNG' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fuel: CNG' }))
    expect(screen.getByRole('option', { name: 'CNG' })).toHaveAttribute('aria-selected', 'true')
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(<><p>outside</p><Controlled /></>)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    await user.click(screen.getByText('outside'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows a search box for long lists that filters options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const many = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `Client ${i}` }))
    render(<Controlled options={many} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    const search = await screen.findByRole('combobox', { name: 'Search Fuel' })
    await vi.waitFor(() => expect(search).toHaveFocus())

    await user.type(search, '7')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('says when no option matches the search', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `Client ${i}` }))
    render(<Controlled options={many} />)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    await user.type(await screen.findByRole('combobox'), 'zzz')
    expect(screen.getByText('No results found', { selector: '.ui-empty' })).toBeInTheDocument()
  })

  it('names itself from aria-labelledby plus the chosen value when no label is given', () => {
    render(
      <>
        <span id="tank-label">Tank</span>
        <SearchableSelect aria-labelledby="tank-label" value="DIESEL" options={fuels} onChange={vi.fn()} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Tank Diesel' })).toBeInTheDocument()
  })

  it('does not open while disabled', async () => {
    const user = userEvent.setup()
    render(<SearchableSelect label="Fuel" value="" options={fuels} onChange={vi.fn()} disabled />)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('SearchableSelect search announcements', () => {
  const many: SelectOption[] = ['Petrol', 'Diesel', 'CNG', 'Speed Petrol', 'Speed Diesel', 'Lubricant'].map((label) => ({ value: label, label }))

  it('announces how many options match the search and when none do', async () => {
    const user = userEvent.setup()
    render(<Controlled options={many} />)
    await user.click(screen.getByRole('button', { name: /Fuel/ }))
    const search = await screen.findByRole('combobox')
    await user.type(search, 'diesel')
    expect(screen.getByText('2 results')).toHaveAttribute('aria-live', 'polite')
    await user.clear(search)
    await user.type(search, 'xyz')
    expect(screen.getByText('No results found', { selector: '[aria-live]' })).toBeInTheDocument()
  })
})
