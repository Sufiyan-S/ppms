import { describe, expect, it } from 'vitest'
import { newRow } from './deliveryRows'

describe('newRow', () => {
  it('creates an empty row for the given default tank', () => {
    expect(newRow('4')).toMatchObject({ tankId: '4', qty: '', costPrice: '' })
  })

  it('leaves the tank empty when no default is given', () => {
    expect(newRow().tankId).toBe('')
  })

  it('gives every row a new, increasing id', () => {
    const first = newRow()
    const second = newRow()
    expect(second.id).toBeGreaterThan(first.id)
  })
})
