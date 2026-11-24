import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FuelPrice, PumpSummary } from '../../api/pumpApi'
import { PageSection } from '../../components/layout/PageSection'
import { FuelPricesContent } from './FuelPricesContent'
import { GstDetailsContent } from './GstDetailsContent'
import { PumpSettingsContent } from './PumpSettingsContent'
import { TanksContent } from './TanksContent'
import { NozzleContent } from './nozzles/NozzleContent'
import { ShiftDefinitionsContent } from './shiftDefinitions/ShiftDefinitionsContent'
import { StaffContent } from './staff/StaffContent'
import { TankersContent } from './tankers/TankersContent'
import type { SectionKey } from './sectionKey'

export interface SetupAreaProps {
  pump: PumpSummary
  section: SectionKey
  summary: string
  currentPrices: FuelPrice[]
  staffCount: number
  onPumpUpdated: () => void
  isAddStaffOpen: boolean
  onOpenAddStaff: () => void
  onCloseAddStaff: () => void
  /** Shown beside the title, such as the step's state while setup is still under way. */
  titleMeta?: ReactNode
}

/** One setup area as a titled card: its name, a one-line summary and the area's own editor. */
export function SetupArea({
  pump, section, summary, currentPrices, staffCount, onPumpUpdated, isAddStaffOpen, onOpenAddStaff, onCloseAddStaff, titleMeta,
}: SetupAreaProps) {
  const { t } = useTranslation('setup')

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

  return (
    <PageSection
      title={t(`steps.names.${section}`)}
      titleMeta={titleMeta}
      description={summary}
      actions={section === 'staff' && staffCount > 0 && !isAddStaffOpen && (
        <button type="button" onClick={onOpenAddStaff} className="ui-btn ui-btn-primary ui-btn-compact gap-1.5">
          <UserPlus size={14} strokeWidth={2} aria-hidden="true" />
          {t('staff.add.open')}
        </button>
      )}
    >
      {content[section]}
    </PageSection>
  )
}
