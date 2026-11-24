import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormGrid } from '../../../components/layout/FormGrid'
import { istDateString } from '../../../utils/date'
import { whatsAppNumber, whatsAppShareUrl } from '../../../utils/whatsApp'
import { lastCompletedMonth } from '../creditDates'
import { statementMessage } from '../statementMessage'

type PeriodPreset = 'last-month' | 'this-month' | 'custom'

/** Each label is credit.json statement.presets.<labelKey>. */
const PRESETS: { value: PeriodPreset; labelKey: 'lastMonth' | 'thisMonth' | 'custom' }[] = [
  { value: 'last-month', labelKey: 'lastMonth' },
  { value: 'this-month', labelKey: 'thisMonth' },
  { value: 'custom', labelKey: 'custom' },
]

function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, today: string) {
  if (preset === 'this-month') return { fromDate: `${today.slice(0, 8)}01`, toDate: today }
  const { periodFrom, periodTo } = lastCompletedMonth(today)
  return { fromDate: periodFrom, toDate: periodTo }
}

interface StatementModalProps {
  pumpId: number
  clientId: number
  clientName: string
  phone: string | null
  outstanding: number
  onClose: () => void
}

export function StatementModal({ pumpId, clientId, clientName, phone, outstanding, onClose }: StatementModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const today = istDateString()
  const [preset, setPreset] = useState<PeriodPreset>('last-month')
  const [period, setPeriod] = useState(() => presetPeriod('last-month', today))
  const periodErrorId = useId()

  const choosePreset = (value: PeriodPreset) => {
    setPreset(value)
    if (value !== 'custom') setPeriod(presetPeriod(value, today))
  }

  const periodValid = period.fromDate !== '' && period.toDate !== '' && period.fromDate <= period.toDate
  const shareUrl = periodValid
    ? whatsAppShareUrl(phone, statementMessage(clientName, period.fromDate, period.toDate, outstanding))
    : null

  return (
    <Modal
      title={t('statement.title')}
      subtitle={clientName}
      tone="info"
      onClose={onClose}
      confirmDiscard={false}
      bodyClassName="space-y-4"
      footer={
        <>
          {shareUrl && (
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-secondary">
              {t('statement.shareWhatsapp')}
            </a>
          )}
          {periodValid ? (
            <a href={creditApi.statementUrl(pumpId, clientId, period)} target="_blank" rel="noopener noreferrer"
              className="ui-btn ui-btn-primary">
              {t('statement.openPrintable')}
            </a>
          ) : (
            <button type="button" disabled aria-describedby={periodErrorId} className="ui-btn ui-btn-primary">
              {t('statement.openPrintable')}
            </button>
          )}
        </>
      }
    >
      <div role="group" aria-label={t('statement.period')} className="ui-tabbar w-fit">
        {PRESETS.map(option => (
          <button key={option.value} type="button" aria-pressed={preset === option.value}
            onClick={() => choosePreset(option.value)}
            className={`ui-tabbar__button ${preset === option.value ? 'ui-tabbar__button--active' : ''}`}>
            {t(`statement.presets.${option.labelKey}`)}
          </button>
        ))}
      </div>
      <FormGrid>
        <label className="block">
          <span className="ui-label">{t('common:fields.from')}</span>
          <input type="date" value={period.fromDate} max={period.toDate || undefined}
            onChange={e => { setPreset('custom'); setPeriod(current => ({ ...current, fromDate: e.target.value })) }} />
        </label>
        <label className="block">
          <span className="ui-label">{t('common:fields.to')}</span>
          <input type="date" value={period.toDate} min={period.fromDate || undefined} max={today}
            onChange={e => { setPreset('custom'); setPeriod(current => ({ ...current, toDate: e.target.value })) }}
          />
        </label>
      </FormGrid>
      {!periodValid && (
        <p id={periodErrorId} role="alert" className="ui-error-text">{t('statement.invalidPeriod')}</p>
      )}
      {!whatsAppNumber(phone) && (
        <p className="text-sm text-ink-3">{t('statement.addMobileToShare')}</p>
      )}
    </Modal>
  )
}
