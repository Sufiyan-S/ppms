import { useRef, useState } from 'react'
import type { CreditClientSummary } from '../../../api/pumpApi'
import type { CreditEntry } from '../../../types/shift'
import type { CreditRow } from '../components/creditRow'

function emptyRow(id: number, fuelType: string): CreditRow {
  return {
    id,
    clientId: null, clientName: '', clientSearch: '',
    showDropdown: false,
    subAccountId: null, subAccountName: '',
    fuelType,
    billNo: '', amount: '', liters: '', inputMode: 'amount', description: '',
    replacesEntryId: null,
  }
}

/** Credit entries added while closing a shift, including edited copies of entries recorded mid-shift. */
export function useCloseShiftCreditRows(availableFuelTypes: string[], creditClients: CreditClientSummary[], initialRows: CreditRow[] = []) {
  const nextRowId = useRef(initialRows.reduce((max, row) => Math.max(max, row.id), 0) + 1)
  const [creditRows, setCreditRows] = useState<CreditRow[]>(initialRows)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)

  const addCreditRow = () => {
    const newId = nextRowId.current++
    setCreditRows((rows) => [...rows, emptyRow(newId, availableFuelTypes[0] ?? '')])
    setExpandedRowId(newId)
  }

  const updateRow = <K extends keyof CreditRow>(id: number, field: K, value: CreditRow[K]) =>
    setCreditRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))

  const updateRowMulti = (id: number, updates: Partial<CreditRow>) =>
    setCreditRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...updates } : r)))

  const selectClient = (rowId: number, clientId: number, clientName: string) =>
    setCreditRows((rows) => rows.map((r) =>
      r.id === rowId
        ? { ...r, clientId, clientName, clientSearch: clientName, showDropdown: false, subAccountId: null, subAccountName: '' }
        : r
    ))

  const removeCreditRow = (id: number) => {
    setCreditRows((rows) => rows.filter((r) => r.id !== id))
    if (expandedRowId === id) setExpandedRowId(null)
  }

  // Editing copies the entry into a new row; the original is voided only when the shift is closed,
  // so cancelling the edit (or the whole modal) leaves the recorded entry untouched.
  const editRecordedEntry = (entry: CreditEntry) => {
    const entryClient = creditClients.find(c => c.id === entry.clientId)
    const parentClient = entryClient?.parentClientId
      ? creditClients.find(c => c.id === entryClient.parentClientId)
      : null
    const rootClient = parentClient ?? entryClient ?? null
    const newId = nextRowId.current++
    setCreditRows(rows => [...rows, {
      ...emptyRow(newId, entry.fuelType ?? availableFuelTypes[0] ?? ''),
      clientId: rootClient?.id ?? null,
      clientName: rootClient?.name ?? entry.clientName,
      clientSearch: rootClient?.name ?? entry.clientName,
      subAccountId: parentClient ? entryClient?.id ?? null : null,
      subAccountName: parentClient ? entryClient?.name ?? '' : '',
      billNo: entry.billNo ?? '',
      amount: String(entry.amount),
      description: entry.description ?? '',
      replacesEntryId: entry.id,
    }])
    setExpandedRowId(newId)
  }

  const clearCreditRows = () => {
    setCreditRows([])
    setExpandedRowId(null)
  }

  return {
    creditRows, expandedRowId, setExpandedRowId, clearCreditRows,
    addCreditRow, updateRow, updateRowMulti, selectClient, removeCreditRow, editRecordedEntry,
  }
}
