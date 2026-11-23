import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../../components/AmountText'
import { toPaise } from '../../../utils/money'
import { emptyNum, fmt } from '../components/creditRow'
import { PaymentField, Section } from './CloseShiftFields'

interface Props {
  cash: string
  upi: string
  card: string
  fleetCard: string
  onCashChange: (value: string) => void
  onUpiChange: (value: string) => void
  onCardChange: (value: string) => void
  onFleetCardChange: (value: string) => void
  /** What cash must be for the shift to balance after UPI, card, fleet card and credit. */
  restInCashPaise: number
  creditTotal: number
}

export function PaymentSection({
  cash, upi, card, fleetCard, onCashChange, onUpiChange, onCardChange, onFleetCardChange, restInCashPaise, creditTotal,
}: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const showFillRest = restInCashPaise > 0 && toPaise(emptyNum(cash)) !== restInCashPaise
  const fillRest = showFillRest ? (
    <button type="button" onClick={() => onCashChange((restInCashPaise / 100).toFixed(2))} className="ui-text-action">
      {t('close.payment.fillRest', { amount: fmt(restInCashPaise / 100) })}
    </button>
  ) : null

  return (
    <Section label="3" title={t('close.sections.payment')}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4">
        <PaymentField label={t('close.payment.cash')} value={cash} onChange={onCashChange} action={fillRest} />
        <PaymentField label={t('close.payment.upi')} value={upi} onChange={onUpiChange} />
        <PaymentField label={t('close.payment.card')} value={card} onChange={onCardChange} />
        <PaymentField label={t('close.payment.fleetCard')} value={fleetCard} onChange={onFleetCardChange} />
      </div>
      {creditTotal > 0 && (
        <p className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">{t('close.payment.creditTotal')}</span>
          <MoneyText value={creditTotal} className="font-semibold text-ink" />
        </p>
      )}
    </Section>
  )
}
