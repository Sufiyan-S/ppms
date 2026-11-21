export interface CreditRow {
  id: number
  clientId: number | null        // selected root/parent account id
  clientName: string
  clientSearch: string
  showDropdown: boolean
  subAccountId: number | null    // optional: selected sub-account id
  subAccountName: string
  fuelType: string
  billNo: string
  amount: string
  liters: string
  inputMode: 'amount' | 'liters'
  description: string
  /** Set when this row corrects a pre-recorded entry; that entry is voided only when the shift is closed. */
  replacesEntryId: number | null
}

export const emptyNum = (v: string) => (v === '' ? 0 : Number(v))

export const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
