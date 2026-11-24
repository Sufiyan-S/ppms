import { useTranslation } from 'react-i18next'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { FUEL_UNIT } from '../../../constants/fuel'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { discrepancyTypeOf, formatUnits } from '../close/closeShiftTotals'
import type { BackfillForm } from './useBackfillForm'

/** Whether any payment or credit sale has been entered, so an empty form does not read as a shortage. */
function hasPaymentEntries(form: BackfillForm): boolean {
  return [form.cashCollected, form.upiCollected, form.cardCollected, form.fleetCardCollected].some((value) => value !== '')
    || form.creditRows.length > 0
}

/** Fuel sold, total due, money collected and the difference, worked out as the readings and payments are typed. */
export function BackfillSummary({ form }: { form: BackfillForm }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { selectedNozzleIds, availableNozzles, litersForNozzle, totalExpected, totalCollected, discrepancyAmt } = form

  const soldByUnit = new Map<string, number>()
  for (const nozzleId of selectedNozzleIds) {
    const liters = litersForNozzle(nozzleId)
    const nozzle = availableNozzles.find((n) => n.id === nozzleId)
    if (liters === null || !nozzle) continue
    const unit = FUEL_UNIT[nozzle.fuelType] ?? 'L'
    soldByUnit.set(unit, (soldByUnit.get(unit) ?? 0) + liters)
  }
  const sold = [...soldByUnit].map(([unit, amount]) => formatUnits(amount, unit)).join(' · ')
  const paymentsEntered = hasPaymentEntries(form)
  // With no readings yet the total is 0, which would read as a real figure.
  const totalDue = soldByUnit.size > 0 ? totalExpected : null

  return (
    <LiveFigures
      label={t('close.liveSummary.title')}
      figures={[
        { label: t('close.liveSummary.sold'), value: sold || <span className="text-ink-3">—</span> },
        { label: t('close.liveSummary.totalDue'), value: <MoneyText value={totalDue} /> },
        { label: t('close.liveSummary.collected'), value: <MoneyText value={paymentsEntered ? totalCollected : null} /> },
        {
          label: t('close.liveSummary.difference'),
          value: discrepancyAmt !== null && totalDue !== null && paymentsEntered
            ? <DiscrepancyBadge type={discrepancyTypeOf(discrepancyAmt)} amount={Math.abs(discrepancyAmt)} />
            : <span className="text-ink-3">—</span>,
          isResult: true,
        },
      ]}
    />
  )
}
