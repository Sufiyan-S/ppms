import { formatDecimal, formatWithSign } from '../../../utils/format'

/** "+1.5%" or "−2.0%", one decimal place. */
export const formatPercent = (percent: number) => formatWithSign(percent, (n) => `${formatDecimal(n, 1)}%`)
