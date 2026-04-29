import client from './client'

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID'

export interface PayrollRecord {
  id: number
  pumpId: number
  userId: number
  periodFrom: string
  periodTo: string
  salaryType: 'HOURLY_SHIFT' | 'DAILY'
  // HOURLY_SHIFT fields (operators)
  totalShifts: number
  shift1Shifts: number
  shift1Hours: number
  shift1RateSnapshot: number | null
  standardShifts: number
  standardHours: number
  standardRateSnapshot: number | null
  // DAILY fields (managers / admins / accountants)
  totalDays: number | null
  leaveDays: number | null
  daysWorked: number | null
  dailyRateSnapshot: number | null
  grossAmount: number
  deductions: number
  netPay: number
  notes: string | null
  status: PayrollStatus
  approvedBy: number | null
  createdAt: string
  updatedAt: string
}

export interface PendingDiscrepancy {
  id: number
  shiftDate: string
  duNumber: number | null
  duName: string | null
  discrepancyType: 'SHORT' | 'OVER'
  discrepancyAmount: number
  discrepancyReason: string | null
}

export interface GeneratePayrollRequest {
  userId: number
  periodFrom: string
  periodTo: string
  notes: string | null
  /** Shift IDs the owner chose to resolve as SALARY_DEDUCTION in this payroll run. */
  deductFromSalaryShiftIds?: number[]
}

export const payrollApi = {
  getPayroll: (pumpId: number): Promise<PayrollRecord[]> =>
    client.get(`/pumps/${pumpId}/payroll`).then(r => r.data),

  getPendingDiscrepancies: (pumpId: number, userId: number): Promise<PendingDiscrepancy[]> =>
    client.get(`/pumps/${pumpId}/payroll/pending-discrepancies`, { params: { userId } }).then(r => r.data),

  generatePayroll: (pumpId: number, data: GeneratePayrollRequest): Promise<PayrollRecord> =>
    client.post(`/pumps/${pumpId}/payroll/generate`, data).then(r => r.data),

  deletePayroll: (pumpId: number, recordId: number): Promise<void> =>
    client.delete(`/pumps/${pumpId}/payroll/${recordId}`).then(() => undefined),

  updateStatus: (pumpId: number, recordId: number, status: PayrollStatus): Promise<PayrollRecord> =>
    client.patch(`/pumps/${pumpId}/payroll/${recordId}/status`, { status }).then(r => r.data),
}
