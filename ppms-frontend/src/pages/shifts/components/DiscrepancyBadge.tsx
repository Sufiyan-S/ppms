import { StatusBadge } from '../../../components/StatusBadge'
import { discrepancyBadge } from '../../../components/statusBadges'
import { formatCurrency } from '../../../utils/format'

/** SHORT, OVER or Balanced with an icon and the word, so the result never depends on colour alone. */
export function DiscrepancyBadge({ type, amount }: { type: 'SHORT' | 'OVER' | null; amount: number }) {
  const { tone, icon, label } = discrepancyBadge(type)
  return <StatusBadge tone={tone} icon={icon} label={type === null ? label : `${label} ${formatCurrency(amount)}`} />
}
