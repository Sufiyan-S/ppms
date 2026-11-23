import { describe, expect, it } from 'vitest'
import { commandItemsFor } from './commandItems'

const actionsFor = (role: Parameters<typeof commandItemsFor>[0]) =>
  commandItemsFor(role).filter(item => item.kind === 'action')

describe('command palette quick actions', () => {
  it('opens every task straight from the page address', () => {
    for (const item of actionsFor('OWNER')) {
      expect(new URL(item.path, 'http://ppms.test').searchParams.get('action')).toBeTruthy()
    }
  })

  it('gives the owner every task, including payroll and adding staff', () => {
    expect(actionsFor('OWNER').map(item => item.label)).toEqual([
      'Open shift', 'Record delivery', 'Record dip check', 'Record payment', 'Record settlement',
      'Add expense', 'Record cash entry', 'Sell a product', 'Generate balance sheet',
      'Generate payroll', 'Set fuel prices', 'Add staff member',
    ])
  })

  it('keeps owner-only and setup-manager tasks away from a manager', () => {
    const labels = actionsFor('MANAGER').map(item => item.label)
    expect(labels).toContain('Set fuel prices')
    expect(labels).not.toContain('Generate payroll')
    expect(labels).not.toContain('Add staff member')
  })

  it('offers an operator no quick actions they cannot do', () => {
    expect(actionsFor('OPERATOR').map(item => item.label)).not.toContain('Record delivery')
  })
})
