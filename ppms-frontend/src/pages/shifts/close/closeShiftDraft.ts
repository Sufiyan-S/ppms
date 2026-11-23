import type { SubmitAttempt } from '../../../utils/idempotencyKey'
import type { CreditRow } from '../components/creditRow'
import type { HandoverDetails } from './handoverDetails'

/** What the close / handover form keeps on this device until the shift is closed or the entries are discarded. */
export interface CloseShiftDraft {
  endReadings: Record<number, string>
  noChangeNozzleIds: number[]
  cash: string
  upi: string
  card: string
  fleetCard: string
  discrepancyReason: string
  handoverDetails: HandoverDetails
  creditRows: CreditRow[]
  submitAttempt: SubmitAttempt | null
}

export function closeShiftDraftName(shiftId: number, isHandover: boolean): string {
  return `${isHandover ? 'handover' : 'close-shift'}:${shiftId}`
}

export function restoredCreditRows(draft: CloseShiftDraft | undefined): CreditRow[] {
  return (draft?.creditRows ?? []).map((row) => ({ ...row, showDropdown: false }))
}
