import type { FuelReading } from '../../../types/shift'
import { roundToPaise, toPaise, unitsSold } from '../../../utils/money'
import { formatDecimal } from '../../../utils/format'
import { emptyNum } from '../components/creditRow'

interface TotalsInput {
  fuelReadings: FuelReading[]
  endReadings: Record<number, string>
  noChangeNozzles: Set<number>
  cash: string
  upi: string
  card: string
  fleetCard: string
  preRecordedTotal: number
  newCreditTotal: number
}

export interface FuelSale {
  reading: FuelReading
  sold: number
  value: number
  isBelowStart: boolean
}

// Mirrors the backend: units rounded to 3 decimals, the total due rounded once to paise.
export function computeCloseShiftTotals({
  fuelReadings, endReadings, noChangeNozzles, cash, upi, card, fleetCard, preRecordedTotal, newCreditTotal,
}: TotalsInput) {
  const perFuelSales: FuelSale[] = fuelReadings.map((r) => {
    const endRaw = endReadings[r.nozzleId] ?? ''
    const sold = endRaw !== '' ? unitsSold(r.startReading, Number(endRaw), r.maxMeterValue) : 0
    return {
      reading: r,
      sold: sold ?? 0,
      value: (sold ?? 0) * r.priceSnapshot,
      isBelowStart: sold === null && !noChangeNozzles.has(r.nozzleId),
    }
  })

  const totalDue       = roundToPaise(perFuelSales.reduce((s, x) => s + x.value, 0))
  // creditTotal for the close request = pre-recorded entries + new entries added here
  const creditTotal    = roundToPaise(preRecordedTotal + newCreditTotal)
  const totalCollected = roundToPaise(emptyNum(cash) + emptyNum(upi) + emptyNum(card) + emptyNum(fleetCard) + creditTotal)
  const diffPaise      = toPaise(totalCollected) - toPaise(totalDue)

  const readingsComplete = fuelReadings.every((r) => (endReadings[r.nozzleId] ?? '') !== '')
  const readingsBelowStart = perFuelSales.some((x) => x.isBelowStart)
  // Consider "touched" if any payment field has a value, OR if pre-recorded credit exists
  const paymentTouched   = cash !== '' || upi !== '' || card !== '' || fleetCard !== '' || creditTotal > 0
  const readyToCompare   = readingsComplete && !readingsBelowStart && paymentTouched
  // The backend flags any paise difference, so a sub-rupee gap is either rounded into cash or explained.
  const hasDiscrepancy   = readyToCompare && diffPaise !== 0

  return {
    perFuelSales,
    totalDue,
    creditTotal,
    totalCollected,
    diffPaise,
    diff: diffPaise / 100,
    readingsComplete,
    readingsBelowStart,
    paymentTouched,
    isBalanced: readyToCompare && diffPaise === 0,
    hasDiscrepancy,
    canRoundOff: hasDiscrepancy && Math.abs(diffPaise) < 100,
  }
}

export function discrepancyTypeOf(diff: number): 'SHORT' | 'OVER' | null {
  if (diff < 0) return 'SHORT'
  if (diff > 0) return 'OVER'
  return null
}

/** Whether a gap of this size goes to the owner for approval, mirroring the server's escalation rule. */
export function needsOwnerApproval(diff: number, escalationThreshold: number | null): boolean {
  return escalationThreshold !== null && escalationThreshold > 0 && Math.abs(diff) > escalationThreshold
}

/** "12.50 L" or "3.00 kg": the fuel's own unit, which the litre formatter would always print as L. */
export function formatUnits(amount: number, unit: string): string {
  return `${formatDecimal(amount)} ${unit}`
}
