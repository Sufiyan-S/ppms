import type { CreditTransaction } from '../../api/creditApi'
import { getWeekKey } from './creditDates'

// ─── Helpers for week grouping ───────────────────────────────────────────────

// Transaction in the merged parent view, carrying which sub-account it came from
export type MergedTx = CreditTransaction & { subAccountName?: string; sourceClientId: number }

// Rows keep their ledger order; a back-dated payment joins the week it was paid in rather than opening a second group.
export function buildWeekGroups<T extends CreditTransaction>(txs: T[]): Array<{ label: string; items: T[] }> {
  const groups = new Map<string, T[]>()
  txs.forEach(tx => {
    const label = getWeekKey(tx.businessDate)
    const items = groups.get(label)
    if (items) items.push(tx)
    else groups.set(label, [tx])
  })
  return Array.from(groups, ([label, items]) => ({ label, items }))
}
