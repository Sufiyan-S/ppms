import type { DUOption, NozzleDetail } from '../../../types/shift'
import { FUEL_UNIT } from '../../../constants/fuel'
import { formatNumberIn } from '../../../i18n/format'

export function activeNozzlesOf(du: DUOption): NozzleDetail[] {
  return du.nozzles.filter((n) => n.status === 'ACTIVE')
}

export function formatMeterReading(nozzle: NozzleDetail): { reading: string; unit: string } {
  return {
    reading: formatNumberIn(nozzle.lastReading, { maximumFractionDigits: 3 }),
    unit: FUEL_UNIT[nozzle.fuelType] ?? 'L',
  }
}
