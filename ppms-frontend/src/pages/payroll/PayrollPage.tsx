import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { canPerformAction } from '../../permissions/permissions'
import { userApi } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { PayrollStatus } from '../../api/payrollApi'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { GeneratePayrollDialog } from './GeneratePayrollDialog'
import { PayrollRecords } from './PayrollRecords'

/** Salary drafts, approvals and payments per staff member; ?action=generate-payroll opens the generate form. */
export default function PayrollPage() {
  const { t } = useTranslation(['payroll', 'common'])
  const { user } = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()
  const canGenerate = canPerformAction('payroll:generate', user?.role)
  const generateAction = useUrlParam('action')
  const showGenerate = generateAction.value === 'generate-payroll' && canGenerate && pumpId !== null

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

  const [openGroup, setOpenGroup] = useState<PayrollStatus | null>('DRAFT')

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        primaryAction={canGenerate && pumpId !== null && (
          <button type="button" onClick={() => generateAction.set('generate-payroll')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('generate.title')}
          </button>
        )}
      />

      {pumpId === null ? (
        <div className="ui-card text-center text-sm text-ink-3">{t('common:notices.noPump')}</div>
      ) : (
        <>
          {recordsError && (
            <div className="ui-alert ui-alert-warning text-sm">
              {t('page.loadFailed')}
            </div>
          )}

          <PayrollRecords
            pumpId={pumpId}
            staff={staff}
            records={records}
            isLoading={isLoading}
            openGroup={openGroup}
            onOpenGroupChange={setOpenGroup}
          />
        </>
      )}

      {showGenerate && (
        <GeneratePayrollDialog pumpId={pumpId} staff={staff} onGenerated={() => setOpenGroup('DRAFT')} onClose={generateAction.remove} />
      )}
    </Page>
  )
}
