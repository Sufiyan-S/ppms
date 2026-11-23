import { useTranslation } from 'react-i18next'
import { toPaise } from '../../../utils/money'
import { fmt } from '../components/creditRow'
import { PaymentField } from '../close/CloseShiftFields'
import { safeParse } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

/** What cash must be for the shift to balance once UPI, card, fleet card and credit are taken off the total due. */
function restInCashPaise(form: BackfillForm): number {
  const { totalExpected, upiCollected, cardCollected, fleetCardCollected, creditNum } = form
  if (totalExpected === null) return 0
  return Math.max(0, toPaise(totalExpected) - toPaise(safeParse(upiCollected)) - toPaise(safeParse(cardCollected))
    - toPaise(safeParse(fleetCardCollected)) - toPaise(creditNum))
}

export function PaymentSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation('shifts')
  const { cashCollected, setCashCollected, upiCollected, setUpiCollected, cardCollected, setCardCollected, fleetCardCollected, setFleetCardCollected } = form
  const rest = restInCashPaise(form)
  const fillRest = rest > 0 && toPaise(safeParse(cashCollected)) !== rest ? (
    <button type="button" onClick={() => setCashCollected((rest / 100).toFixed(2))} className="ui-text-action">
      {t('close.payment.fillRest', { amount: fmt(rest / 100) })}
    </button>
  ) : null

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-x-4">
      <PaymentField label={t('backfill.payment.cash')} value={cashCollected} onChange={setCashCollected} action={fillRest} />
      <PaymentField label={t('backfill.payment.upi')} value={upiCollected} onChange={setUpiCollected} />
      <PaymentField label={t('backfill.payment.card')} value={cardCollected} onChange={setCardCollected} />
      <PaymentField label={t('backfill.payment.fleetCard')} value={fleetCardCollected} onChange={setFleetCardCollected} />
    </div>
  )
}
