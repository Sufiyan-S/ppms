import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePumpStore } from '../../store/usePumpStore'
import { userApi } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { PayrollStatus } from '../../api/payrollApi'
import { Reveal } from '../../components/Reveal'
import { GeneratePayrollForm } from './GeneratePayrollForm'
import { PayrollRecords } from './PayrollRecords'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn:  () => userApi.getStaff(pumpId!),
    enabled:  !!pumpId,
  })

  const { data: records = [], isLoading, error: recordsError } = useQuery({
    queryKey: ['payroll', pumpId],
    queryFn:  () => payrollApi.getPayroll(pumpId!),
    enabled:  !!pumpId,
  })

  // ── Accordion: track which status group is open ────────────────────────────
  const [openGroup, setOpenGroup] = useState<PayrollStatus | null>('DRAFT')

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-page-header">
        <div>
        <h1 className="ui-title-sm">Payroll</h1>
        <p className="ui-subtitle">Calculate and track staff salary payments based on shift history</p>
        </div>
      </div>
      </Reveal>

      {recordsError && (
        <div className="ui-alert ui-alert-warning text-sm">
          Could not load payroll records. Check your connection and refresh.
        </div>
      )}

      <GeneratePayrollForm pumpId={pumpId} staff={staff} onGenerated={() => setOpenGroup('DRAFT')} />

      <PayrollRecords
        pumpId={pumpId}
        staff={staff}
        records={records}
        isLoading={isLoading}
        openGroup={openGroup}
        onOpenGroupChange={setOpenGroup}
      />
    </div>
  )
}
