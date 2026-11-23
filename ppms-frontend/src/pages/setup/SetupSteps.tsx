import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Circle, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, SetupChecklist } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { PageSection } from '../../components/layout/PageSection'
import { StatusBadge } from '../../components/StatusBadge'
import type { StatusTone } from '../../components/StatusBadge'
import { isPriceStale } from '../../utils/fuelPrices'
import { serverText } from '../../utils/serverText'
import { FuelPricesContent } from './FuelPricesContent'
import { GstDetailsContent } from './GstDetailsContent'
import { PumpSettingsContent } from './PumpSettingsContent'
import { TanksContent } from './TanksContent'
import { NozzleContent } from './nozzles/NozzleContent'
import { ShiftDefinitionsContent } from './shiftDefinitions/ShiftDefinitionsContent'
import { StaffContent } from './staff/StaffContent'
import { TankersContent } from './tankers/TankersContent'
import type { SectionKey } from './sectionKey'
import { SetupStepList } from './SetupStepList'
import { SETUP_STEPS, searchForStep, stepState } from './setupStepOrder'
import type { StepState } from './setupStepOrder'
import { useChecklistOpen } from './useChecklistOpen'

const STATE_BADGE: Record<StepState, { tone: StatusTone; icon: LucideIcon }> = {
  done: { tone: 'ok', icon: Check },
  toDo: { tone: 'warn', icon: AlertTriangle },
  optional: { tone: 'neutral', icon: Circle },
}

interface SetupStepsProps {
  pump: PumpSummary
  checklist: SetupChecklist | undefined
  currentStep: SectionKey
  onPumpUpdated: () => void
  isAddStaffOpen: boolean
  onOpenAddStaff: () => void
  onCloseAddStaff: () => void
}

/** The step list and the one step that is open, with links to the steps either side of it. */
export function SetupSteps({ pump, checklist, currentStep, onPumpUpdated, isAddStaffOpen, onOpenAddStaff, onCloseAddStaff }: SetupStepsProps) {
  const { t } = useTranslation(['setup', 'common'])
  const [searchParams] = useSearchParams()
  const [isChecklistOpen, setChecklistOpen] = useChecklistOpen(!!checklist && checklist.doneCount === checklist.requiredCount)

  const { data: currentPrices = [] } = useQuery({
    queryKey: ['fuelPrices', pump.id],
    queryFn: () => pumpApi.getCurrentPrices(pump.id),
  })
  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pump.id],
    queryFn: () => userApi.getStaff(pump.id),
  })
  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-definitions', pump.id],
    queryFn: () => shiftDefinitionApi.getAll(pump.id),
  })

  const index = SETUP_STEPS.findIndex((step) => step.key === currentStep)
  const step = SETUP_STEPS[index]
  const previousStep = SETUP_STEPS[index - 1]
  const nextStep = SETUP_STEPS[index + 1]
  const state = stepState(step, checklist)
  const checklistItem = checklist?.items.find((item) => item.step === step.checklistStep)
  const stepName = (key: SectionKey) => t(`steps.names.${key}`)

  const scheduleCount = new Set(shiftDefs.map((d) => `${d.effectiveFrom}|${d.effectiveTo ?? 'open'}`)).size
  const summaries: Record<SectionKey, string> = {
    nozzles: t('sections.nozzles.summary', { used: pump.dus.length, max: pump.maxDuCount }),
    tanks: checklistItem ? serverText(checklistItem.detailCode, checklistItem.detailParams, checklistItem.detail)
      : pump.dus.length > 0 ? t('sections.tanks.tapToConfigure') : t('sections.tanks.addDuFirst'),
    prices: currentPrices.length === 0
      ? t('sections.prices.notSet')
      : currentPrices.map((p) => `${p.fuelType.charAt(0)}: ₹${p.pricePerUnit}`).join(' · ')
        + (isPriceStale(currentPrices) ? t('sections.prices.notUpdatedToday') : ''),
    shifts: scheduleCount > 0 ? t('sections.shifts.schedules', { count: scheduleCount }) : t('sections.notConfigured'),
    staff: staff.length > 0 ? t('sections.staff.members', { count: staff.length }) : t('sections.staff.noneAdded'),
    gst: pump.gstin ? t('sections.gst.summary', { gstin: pump.gstin }) : t('sections.notConfigured'),
    credit: checklistItem ? serverText(checklistItem.detailCode, checklistItem.detailParams, checklistItem.detail) : t('steps.credit.body'),
    tankers: t('sections.tankers.summary'),
    settings: pump.discrepancyEscalationThreshold
      ? t('sections.settings.escalation', { amount: pump.discrepancyEscalationThreshold })
      : t('sections.notConfigured'),
  }

  const content: Record<SectionKey, ReactNode> = {
    nozzles: <NozzleContent pump={pump} onAdded={onPumpUpdated} />,
    tanks: <TanksContent pump={pump} />,
    prices: <FuelPricesContent pump={pump} currentPrices={currentPrices} />,
    shifts: <ShiftDefinitionsContent pumpId={pump.id} />,
    staff: <StaffContent pump={pump} isAddFormOpen={isAddStaffOpen} onCloseAddForm={onCloseAddStaff} />,
    gst: <GstDetailsContent pump={pump} onUpdated={onPumpUpdated} />,
    credit: (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">{t('steps.credit.body')}</p>
        <Link to="/dashboard/credit" className="ui-btn ui-btn-secondary inline-flex">{t('steps.credit.open')}</Link>
      </div>
    ),
    tankers: <TankersContent pumpId={pump.id} />,
    settings: <PumpSettingsContent pump={pump} onUpdated={onPumpUpdated} />,
  }

  const badge = STATE_BADGE[state]
  const stateLabel = state === 'done' ? t('common:actions.done') : state === 'toDo' ? t('checklist.toDo') : t('common:fields.optional')

  return (
    <div className={`grid gap-(--density-gap) lg:items-start ${isChecklistOpen ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
      <SetupStepList currentStep={currentStep} checklist={checklist} isOpen={isChecklistOpen} onOpenChange={setChecklistOpen} />

      <div className="flex min-w-0 flex-col gap-(--density-gap)">
        <PageSection
          title={stepName(currentStep)}
          titleMeta={<StatusBadge tone={badge.tone} icon={badge.icon} label={stateLabel} />}
          description={summaries[currentStep]}
          actions={currentStep === 'staff' && staff.length > 0 && !isAddStaffOpen && (
            <button type="button" onClick={onOpenAddStaff} className="ui-btn ui-btn-primary ui-btn-compact">
              {t('staff.add.open')}
            </button>
          )}
        >
          {content[currentStep]}
        </PageSection>

        <nav aria-label={t('steps.navigationLabel')} className="flex flex-wrap items-center justify-between gap-2">
          {previousStep ? (
            <Link to={{ search: searchForStep(searchParams, previousStep.key) }} replace className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5">
              <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
              {t('steps.previous', { step: stepName(previousStep.key) })}
            </Link>
          ) : <span />}
          {nextStep && (
            <Link to={{ search: searchForStep(searchParams, nextStep.key) }} replace className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
              {t('steps.next', { step: stepName(nextStep.key) })}
              <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </div>
    </div>
  )
}
