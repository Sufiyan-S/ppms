import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { GeneratePayrollRequest } from '../../api/payrollApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Reveal } from '../../components/Reveal'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { ReviewModal } from './ReviewModal'
import { todayIso, yesterdayIso } from './payrollFormat'
import { codeLabel } from '../../constants/labels'

interface GeneratePayrollFormProps {
  pumpId: number | null
  staff: StaffMember[]
  onGenerated: () => void
}

export function GeneratePayrollForm({ pumpId, staff, onGenerated }: GeneratePayrollFormProps) {
  const { addToast } = useToastStore()
  const qc = useQueryClient()
  const [form, setForm] = useState<GeneratePayrollRequest>(() => ({
    userId: 0,
    periodFrom: yesterdayIso(),
    periodTo: todayIso(),
    notes: null,
  }))
  const [formError, setFormError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const generateMutation = useMutation({
    mutationFn: (data: GeneratePayrollRequest) => payrollApi.generatePayroll(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      setForm({ userId: 0, periodFrom: yesterdayIso(), periodTo: todayIso(), notes: null })
      setFormError(null)
      setReviewOpen(false)
      onGenerated()
      addToast('Payroll draft generated', 'success')
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to generate payroll')
      setFormError(msg)
      addToast(msg, 'error')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.userId) { setFormError('Please select a staff member'); return }
    if (!form.periodFrom || !form.periodTo) { setFormError('Period dates are required'); return }
    setFormError(null)
    setReviewOpen(true)
  }

  const selectedStaff = staff.find((s) => s.id === form.userId)

  return (
    <>
      {/* ── Generate form ── */}
      <Reveal delay={130}>
      <form onSubmit={handleSubmit} className="ui-card ui-form-shell">
        <div className="ui-form-shell__head">
          <div>
            <p className="ui-section-kicker mb-2">Payroll Draft</p>
            <h2 className="ui-title-sm">Generate payroll</h2>
            <p className="ui-subtitle mt-1">Select a staff member and pay period to calculate a draft salary record.</p>
          </div>
        </div>

        <div className="ui-form-shell__grid">
          <div>
            <span className="ui-label">Staff Member</span>
            <SearchableSelect label="Staff Member"
              value={form.userId ? form.userId.toString() : ''}
              onChange={v => setForm(f => ({ ...f, userId: parseInt(v) || 0 }))}
              placeholder="Select staff…"
              options={staff.map((s) => ({ value: s.id.toString(), label: `${s.fullName} — ${codeLabel(s.role)}` }))}
            />
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Period From</span>
              <input
                type="date"
                value={form.periodFrom}
                onChange={e => setForm(f => ({ ...f, periodFrom: e.target.value }))}
                className="text-sm"
                required
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Period To</span>
              <input
                type="date"
                value={form.periodTo}
                onChange={e => setForm(f => ({ ...f, periodTo: e.target.value }))}
                className="text-sm"
                required
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="ui-label">Notes (optional)</span>
              <input
                type="text"
                value={form.notes ?? ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                className="text-sm"
                placeholder="Any notes about this pay period"
              />
            </label>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Operators: actual hours per closed shift × hourly rate (night/day separately).
          Managers &amp; Admins: daily rate × (days in period − leave days).
          Configure rates in Setup → Staff → ₹ Rates.
        </p>

        {formError && <p role="alert" className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={generateMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {generateMutation.isPending
            ? <span className="flex items-center gap-1.5"><Spinner />Calculating…</span>
            : 'Review Payroll'}
        </button>
      </form>
      </Reveal>

      {reviewOpen && form.userId > 0 && (
        <ReviewModal
          form={form}
          selectedStaff={selectedStaff}
          pumpId={pumpId!}
          formError={formError}
          isPending={generateMutation.isPending}
          onClose={() => setReviewOpen(false)}
          onGenerate={(deductIds) => generateMutation.mutate({ ...form, deductFromSalaryShiftIds: deductIds })}
        />
      )}
    </>
  )
}
