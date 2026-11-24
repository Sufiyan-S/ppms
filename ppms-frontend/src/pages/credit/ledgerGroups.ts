import type { CreditTransaction } from '../../api/creditApi'
import { FUEL_LABELS } from '../../constants/fuel'
import { codeLabel } from '../../constants/labels'
import { serverText } from '../../utils/serverText'
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

// ─── Helpers for one ledger entry ────────────────────────────────────────────

function detailText(tx: CreditTransaction): string {
  if (!tx.detail) return '—'
  if (tx.type === 'SALE') return tx.detail in FUEL_LABELS ? codeLabel(tx.detail) : tx.detail
  if (tx.type === 'PAYMENT') return codeLabel(tx.detail)
  return tx.detail
}

/** What the entry was for: the server-written reference, else the fuel or payment mode. */
export function entryDescription(tx: CreditTransaction): string {
  return (tx.reference && serverText(tx.referenceCode, tx.referenceParams, tx.reference)) || detailText(tx)
}

export function signedEntryAmount(tx: CreditTransaction): number {
  return tx.type === 'PAYMENT' ? -tx.amount : tx.amount
}

export function entryAmountClass(tx: CreditTransaction): string {
  return tx.type === 'PAYMENT' ? 'text-ok' : tx.type === 'INTEREST' ? 'text-info' : 'text-warn'
}
