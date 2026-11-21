import { useState, useMemo } from 'react'
import type { StaffMember } from '../../api/userApi'
import type { PayrollRecord, PayrollStatus } from '../../api/payrollApi'
import { toMonthKey } from './payrollFormat'

export function usePayrollGroups(records: PayrollRecord[], staff: StaffMember[]) {
  // Derive sorted list of unique month keys ("2026-04") from all records
  const monthOptions = useMemo(() => {
    const keys = new Set(records.map(r => toMonthKey(r.periodFrom)))
    return Array.from(keys).sort().reverse()   // newest first
  }, [records])

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [nameSearch,    setNameSearch]    = useState('')

  // ── Per-status pagination (independent, default page size = 10) ──────────
  const [draftPage,        setDraftPage]        = useState(0)
  const [draftPageSize,    setDraftPageSize]    = useState(10)
  const [approvedPage,     setApprovedPage]     = useState(0)
  const [approvedPageSize, setApprovedPageSize] = useState(10)
  const [paidPage,         setPaidPage]         = useState(0)
  const [paidPageSize,     setPaidPageSize]     = useState(10)

  const filtered = useMemo(() => {
    let result = records
    if (selectedMonth) result = result.filter(r => toMonthKey(r.periodFrom) === selectedMonth)
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase()
      result = result.filter(r => {
        const name = (staff.find(s => s.id === r.userId)?.fullName ?? '').toLowerCase()
        return name.includes(q)
      })
    }
    return result
  }, [records, selectedMonth, nameSearch, staff])

  const grouped = useMemo(() => {
    const map: Record<PayrollStatus, PayrollRecord[]> = { DRAFT: [], APPROVED: [], PAID: [] }
    filtered.forEach(r => map[r.status].push(r))
    return map
  }, [filtered])

  return {
    monthOptions, selectedMonth, setSelectedMonth, nameSearch, setNameSearch,
    draftPage, setDraftPage, draftPageSize, setDraftPageSize,
    approvedPage, setApprovedPage, approvedPageSize, setApprovedPageSize,
    paidPage, setPaidPage, paidPageSize, setPaidPageSize,
    filtered, grouped,
  }
}
