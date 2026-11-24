import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { ShiftTimeline } from './ShiftTimeline'

const definition = (id: number, name: string, startTime: string, endTime: string, windowLabel: string): ShiftDefinition => ({
  id, pumpId: 2, name, startTime, endTime, crossesMidnight: endTime < startTime, isNightShift: endTime < startTime,
  sortOrder: id, effectiveFrom: '2026-04-01', effectiveTo: null, windowLabel,
})

const morning = definition(1, 'Morning', '06:00:00', '13:59:00', '6:00 AM – 2:00 PM')
const night = definition(2, 'Night', '22:00:00', '05:59:00', '10:00 PM – 6:00 AM (+1)')

function segment(name: string) {
  return screen.getAllByText(name, { selector: '.ui-timeline__segment' })
}

describe('ShiftTimeline', () => {
  it('draws a day shift as one segment placed by its times', () => {
    renderWithProviders(<ShiftTimeline definitions={[morning]} />)

    const [piece] = segment('Morning')
    expect(piece).toHaveStyle({ left: '25%', width: `${(480 / 1440) * 100}%` })
    expect(screen.getByRole('img', { name: '24-hour timeline. Morning: 6:00 AM – 2:00 PM' })).toBeInTheDocument()
  })

  it('splits an overnight shift into two segments at midnight', () => {
    renderWithProviders(<ShiftTimeline definitions={[morning, night]} />)

    const pieces = segment('Night')
    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toHaveStyle({ left: '0%', width: '25%' })
    expect(pieces[1]).toHaveStyle({ left: `${(1320 / 1440) * 100}%` })
  })

  it('writes out the hours no shift covers', () => {
    renderWithProviders(<ShiftTimeline definitions={[morning, night]} />)
    expect(screen.getByText('No shift covers 2:00 PM – 10:00 PM')).toBeInTheDocument()
    expect(screen.queryByText(/Covers all 24 hours/)).not.toBeInTheDocument()
  })

  it('writes out which shifts overlap and when', () => {
    const evening = definition(3, 'Evening', '13:00:00', '21:59:00', '1:00 PM – 10:00 PM')
    renderWithProviders(<ShiftTimeline definitions={[morning, evening, night]} />)
    expect(screen.getByText('Overlap: Morning & Evening both run 1:00 PM – 2:00 PM')).toBeInTheDocument()
  })

  it('says when the whole day is covered without overlaps', () => {
    const evening = definition(3, 'Evening', '14:00:00', '21:59:00', '2:00 PM – 10:00 PM')
    renderWithProviders(<ShiftTimeline definitions={[morning, evening, night]} />)
    expect(screen.getByText('Covers all 24 hours with no overlaps')).toBeInTheDocument()
  })
})
