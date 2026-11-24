import { useTranslation } from 'react-i18next'
import { Reveal } from '../../components/Reveal'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { useShiftPlanning } from './planning/useShiftPlanning'
import { WeekNavigator } from './planning/WeekNavigator'
import { GeneratePlanModal } from './planning/GeneratePlanModal'
import { PlanningGrid } from './planning/PlanningGrid'
import { PlanningLegend } from './planning/PlanningStatusMark'

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ShiftPlanningPage() {
  const { t } = useTranslation(['shifts', 'common'])
  const form = useShiftPlanning()
  const { isOwnerOrAdmin, pumpId } = form

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('planning.title')}
        description={isOwnerOrAdmin ? t('planning.subtitleOwner') : t('planning.subtitleStaff')}
      />

      {pumpId && (
        <>
          {/* Week navigator + actions */}
          <WeekNavigator form={form} />


          {/* Auto-generate modal */}
          <GeneratePlanModal form={form} />


          {/* Planning grid */}
          <PlanningGrid form={form} />


          {/* Legend */}
          <Reveal delay={270}>
          <PlanningLegend />
          </Reveal>
        </>
      )}
    </Page>
  )
}
