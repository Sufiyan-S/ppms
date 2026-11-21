/** Rounds half away from zero, like the backend's RoundingMode.HALF_UP. */
function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const scaled = Math.abs(value) * factor
  // The small epsilon stops values like 1.005 (stored as 1.00499…) from rounding down.
  const rounded = Math.round(scaled + 1e-9) / factor
  return value < 0 ? -rounded : rounded
}

/** Rupees rounded to whole paise. */
export function roundToPaise(rupees: number): number {
  return roundHalfUp(rupees, 2)
}

/** Whole paise as an integer, so totals can be compared without floating-point drift. */
export function toPaise(rupees: number): number {
  return Math.round(roundToPaise(rupees) * 100)
}

/** Litres (or kg) rounded to the 3 decimals the meter readings are stored with. */
export function roundToMillilitres(units: number): number {
  return roundHalfUp(units, 3)
}

/** Fraction of the meter's maximum above which a lower closing reading counts as a rollover. */
const ROLLOVER_START_FRACTION = 0.99

/**
 * Units sold on a nozzle, mirroring the backend: a closing reading below the opening one is a
 * meter rollover only when the opening reading was near the meter maximum. Returns null when the
 * closing reading is below the opening one and that is not a rollover.
 */
export function unitsSold(startReading: number, endReading: number, maxMeterValue: number | null): number | null {
  if (endReading >= startReading) return roundToMillilitres(endReading - startReading)
  if (maxMeterValue != null && startReading >= maxMeterValue * ROLLOVER_START_FRACTION) {
    return roundToMillilitres(maxMeterValue - startReading + endReading)
  }
  return null
}
