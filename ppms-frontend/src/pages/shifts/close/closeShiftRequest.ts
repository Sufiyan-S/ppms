import type { CloseShiftRequest, CreditEntryInput, FuelReading } from '../../../types/shift'
import { emptyNum } from '../components/creditRow'
import type { CreditRow } from '../components/creditRow'

/** Parses a numeric string, returns null if the result is NaN, Infinity, or negative. */
const safeParse = (v: string, max = 9_999_999): number | null => {
  const n = Number(v)
  if (!isFinite(n) || n < 0 || n > max) return null
  return n
}

interface CloseFormValues {
  fuelReadings: FuelReading[]
  endReadings: Record<number, string>
  readingsBelowStart: boolean
  creditRows: CreditRow[]
  cash: string
  upi: string
  card: string
  fleetCard: string
  creditTotal: number
  discrepancyReason: string
}

export function buildCloseShiftRequest(values: CloseFormValues): { request: CloseShiftRequest } | { error: string } {
  const { fuelReadings, endReadings, readingsBelowStart, creditRows, cash, upi, card, fleetCard, creditTotal, discrepancyReason } = values

  if (readingsBelowStart) {
    return { error: 'End reading cannot be less than the start reading. Please correct the highlighted fields.' }
  }

  for (const row of creditRows) {
    if (!row.clientName.trim()) return { error: 'Each credit entry must have a client.' }
    if (!row.clientId)          return { error: 'Please select a client from the dropdown for each credit entry.' }
    if (!row.fuelType)          return { error: 'Each credit entry must have a fuel type.' }
    if (emptyNum(row.amount) <= 0) return { error: 'Each credit entry amount must be > 0.' }
  }

  for (const r of fuelReadings) {
    if (safeParse(endReadings[r.nozzleId] ?? '') === null) {
      return { error: 'End reading contains an invalid value. Please re-enter.' }
    }
  }

  const paymentFields = [
    { label: 'Cash',       val: cash },
    { label: 'UPI',        val: upi },
    { label: 'Card',       val: card },
    { label: 'Fleet Card', val: fleetCard },
  ]
  for (const f of paymentFields) {
    if (f.val !== '' && safeParse(f.val) === null) {
      return { error: `${f.label} amount contains an invalid value.` }
    }
  }

  const creditEntries: CreditEntryInput[] = creditRows.map((r) => ({
    clientId:    r.subAccountId ?? r.clientId ?? undefined,
    clientName:  r.clientName.trim(),
    billNo:      r.billNo.trim() || undefined,
    amount:      emptyNum(r.amount),
    fuelType:    r.fuelType || undefined,
    description: r.description.trim() || undefined,
  }))

  return {
    request: {
      fuelReadings: fuelReadings.map((r) => ({
        nozzleId:   r.nozzleId,
        endReading: Number(endReadings[r.nozzleId]),
      })),
      cashCollected:      emptyNum(cash),
      upiCollected:       emptyNum(upi),
      cardCollected:      emptyNum(card),
      fleetCardCollected: emptyNum(fleetCard),
      creditTotal,
      creditEntries,
      replacedCreditEntryIds: creditRows.map(r => r.replacesEntryId).filter((id): id is number => id !== null),
      discrepancyReason: discrepancyReason.trim() || undefined,
    },
  }
}
