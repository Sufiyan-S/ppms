import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Gauge, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { canPerformAction } from '../../permissions/permissions'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { FuelPricesContent } from './FuelPricesContent'
import { SetupSteps } from './SetupSteps'
import type { SectionKey } from './sectionKey'
import { firstStepToDo, isSectionKey } from './setupStepOrder'

/** ?action= values the command palette can open Setup with. */
const ACTION_STEPS: Record<string, SectionKey> = { 'add-staff': 'staff', 'set-fuel-prices': 'prices' }

/** A manager may only keep the daily fuel prices up to date. */
function ManagerFuelPrices({ pump }: { pump: PumpSummary }) {
  const { t } = useTranslation('setup')
  const { data: currentPrices = [] } = useQuery({
    queryKey: ['fuelPrices', pump.id],
    queryFn: () => pumpApi.getCurrentPrices(pump.id),
  })
  return (
    <>
      <div className="ui-alert flex items-start gap-2.5 border border-info bg-info-bg text-sm text-info">
        <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>{t('sections.managerNote')}</p>
      </div>
      <PageSection title={t('steps.names.prices')}>
        <FuelPricesContent pump={pump} currentPrices={currentPrices} />
      </PageSection>
    </>
  )
}

export default function SetupPage() {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const selectedPumpId = usePumpStore((state) => state.selectedPumpId)
  const [searchParams, setSearchParams] = useSearchParams()
  const action = useUrlParam('action')
  const canManageSetup = canPerformAction('setup:manage', role)

  const { data: pumps = [], isLoading } = useQuery({
    queryKey: ['myPumps'],
    queryFn: pumpApi.getMyPumps,
  })
  const pump = pumps.find((p) => p.id === selectedPumpId) ?? null

  const { data: checklist, isPending: checklistPending } = useQuery({
    queryKey: ['setup-checklist', pump?.id],
    queryFn: () => pumpApi.getSetupChecklist(pump!.id),
    enabled: !!pump && canManageSetup,
  })

  const sectionParam = searchParams.get('section')
  const actionStep = action.value ? ACTION_STEPS[action.value] : undefined
  const requestedStep = actionStep ?? (isSectionKey(sectionParam) ? sectionParam : null)
  const isWaitingForStartStep = canManageSetup && !!pump && !requestedStep && checklistPending
  const currentStep = requestedStep ?? firstStepToDo(checklist)

  // Puts the starting step in the address once, so finishing it does not move the owner on mid-task.
  useEffect(() => {
    if (!canManageSetup || !pump || requestedStep || checklistPending) return
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      updated.set('section', firstStepToDo(checklist))
      return updated
    }, { replace: true })
  }, [canManageSetup, pump, requestedStep, checklistPending, checklist, setSearchParams])

  const closeAddStaff = () => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    updated.delete('action')
    updated.set('section', 'staff')
    return updated
  }, { replace: true })

  const complete = checklist && checklist.doneCount === checklist.requiredCount

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={pump ? `${pump.name} · ${pump.address}` : t('page.subtitle')}
        badges={pump && (
          <>
            {checklist && (
              <StatusBadge
                tone={complete ? 'ok' : 'warn'}
                label={t('checklist.doneCount', { done: checklist.doneCount, required: checklist.requiredCount })}
              />
            )}
            {canManageSetup && (
              <StatusBadge tone="neutral" icon={Gauge} label={t('sections.duUsage', { used: pump.dus.length, max: pump.maxDuCount })} />
            )}
          </>
        )}
      />

      {!isLoading && pumps.length === 0 ? (
        <p className="ui-empty">{t('page.noPumps')}</p>
      ) : !pump ? (
        !isLoading && <p className="ui-empty">{t('common:notices.noPump')}</p>
      ) : !canManageSetup ? (
        <ManagerFuelPrices pump={pump} />
      ) : isWaitingForStartStep ? (
        <div className="ui-card"><SkeletonRows count={4} /></div>
      ) : (
        <SetupSteps
          pump={pump}
          checklist={checklist}
          currentStep={currentStep}
          onPumpUpdated={() => queryClient.invalidateQueries({ queryKey: ['myPumps'] })}
          isAddStaffOpen={action.value === 'add-staff'}
          onOpenAddStaff={() => action.set('add-staff')}
          onCloseAddStaff={closeAddStaff}
        />
      )}
    </Page>
  )
}
