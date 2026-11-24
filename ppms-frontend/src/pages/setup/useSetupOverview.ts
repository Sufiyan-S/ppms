import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { FuelPrice, PumpSummary, SetupChecklist, TankInfo } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { FUEL_UNIT } from '../../constants/fuel'
import { formatNumberIn } from '../../i18n/format'
import { formatIstDate } from '../../utils/date'
import { isPriceStale } from '../../utils/fuelPrices'
import { serverText } from '../../utils/serverText'
import type { SectionKey } from './sectionKey'

export interface SectionSummary {
  text: string
  /** Something on this area that needs the owner, shown as a badge on its hub card. */
  attention?: string
}

function activeNozzlesOf(pump: PumpSummary) {
  return pump.dus.filter((du) => du.status === 'ACTIVE').flatMap((du) => du.nozzles.filter((n) => n.status === 'ACTIVE'))
}

function oldestPriceDate(prices: FuelPrice[]): string {
  return prices.map((price) => price.effectiveFrom).reduce((oldest, date) => (date < oldest ? date : oldest))
}

function totalLitreCapacity(tanks: TankInfo[]): number {
  return tanks.filter((tank) => (FUEL_UNIT[tank.fuelType] ?? 'L') === 'L').reduce((sum, tank) => sum + Number(tank.capacity), 0)
}

/** The data every setup area shares, and a one-line summary of each area built from it. */
export function useSetupOverview(pump: PumpSummary, checklist: SetupChecklist | undefined) {
  const { t } = useTranslation(['setup', 'common'])

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
  const { data: tanks = [] } = useQuery({
    queryKey: ['tanks', pump.id],
    queryFn: () => pumpApi.getTanks(pump.id),
  })

  const checklistDetail = (step: string) => {
    const item = checklist?.items.find((entry) => entry.step === step)
    return item ? serverText(item.detailCode, item.detailParams, item.detail) : null
  }

  const activeDus = pump.dus.filter((du) => du.status === 'ACTIVE')
  const activeNozzles = activeNozzlesOf(pump)
  const nozzlesWithoutTank = activeNozzles.filter((nozzle) => nozzle.tankId == null).length
  const activeTanks = tanks.filter((tank) => tank.status !== 'INACTIVE')
  const tanksWithoutNozzle = activeTanks.filter((tank) => !activeNozzles.some((nozzle) => nozzle.tankId === tank.id)).length
  const activeStaff = staff.filter((member) => member.status !== 'INACTIVE').length
  const scheduleCount = new Set(shiftDefs.map((d) => `${d.effectiveFrom}|${d.effectiveTo ?? 'open'}`)).size
  const pricesStale = isPriceStale(currentPrices)

  const summaries: Record<SectionKey, SectionSummary> = {
    nozzles: activeDus.length === 0
      ? { text: t('sections.nozzles.none') }
      : {
        text: `${t('sections.nozzles.dus', { count: activeDus.length })} · ${t('sections.nozzles.nozzles', { count: activeNozzles.length })}`,
        attention: nozzlesWithoutTank > 0 ? t('sections.nozzles.withoutTank', { count: nozzlesWithoutTank }) : undefined,
      },
    tanks: activeTanks.length === 0
      ? { text: pump.dus.length > 0 ? t('sections.tanks.none') : t('sections.tanks.addDuFirst') }
      : {
        text: t('sections.tanks.summary', {
          count: activeTanks.length,
          capacity: formatNumberIn(totalLitreCapacity(activeTanks), { maximumFractionDigits: 0 }),
        }),
        attention: tanksWithoutNozzle > 0 ? t('sections.tanks.withoutNozzle', { count: tanksWithoutNozzle }) : undefined,
      },
    prices: currentPrices.length === 0
      ? { text: t('sections.prices.notSet'), attention: t('sections.prices.setToday') }
      : pricesStale
        ? {
          text: t('sections.prices.updatedOn', { date: formatIstDate(oldestPriceDate(currentPrices), { day: 'numeric', month: 'short' }) }),
          attention: t('sections.prices.notUpdatedToday'),
        }
        : { text: t('sections.prices.updatedToday') },
    shifts: { text: scheduleCount > 0 ? t('sections.shifts.schedules', { count: scheduleCount }) : t('sections.notConfigured') },
    staff: { text: activeStaff > 0 ? t('sections.staff.active', { count: activeStaff }) : t('sections.staff.noneAdded') },
    gst: { text: pump.gstin ? t('sections.gst.summary', { gstin: pump.gstin }) : t('sections.notConfigured') },
    credit: { text: checklistDetail('CREDIT_CLIENTS') ?? t('steps.credit.body') },
    tankers: { text: t('sections.tankers.summary') },
    settings: {
      text: pump.discrepancyEscalationThreshold
        ? t('sections.settings.escalation', { amount: pump.discrepancyEscalationThreshold })
        : t('sections.notConfigured'),
    },
  }

  return { currentPrices, staffCount: staff.length, summaries }
}
