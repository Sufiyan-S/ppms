import { useTranslation } from 'react-i18next'
import { formatNumberIn } from '../../../i18n/format'
import type { Tanker } from '../../../api/tankerApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import { LitresText } from '../../../components/AmountText'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'

interface Props {
  date: string
  setDate: (value: string) => void
  invoice: string
  setInvoice: (value: string) => void
  tankers: Tanker[]
  selectedTanker: Tanker | null
  selectedTankerId: number | null
  setSelectedTankerId: (id: number | null) => void
  tankerMismatch: boolean
  tankerRemaining: number | null
  totalEnteredQty: number
}

export function DeliveryHeaderFields({ date, setDate, invoice, setInvoice, tankers, selectedTanker, selectedTankerId, setSelectedTankerId, tankerMismatch, tankerRemaining, totalEnteredQty }: Props) {
  const { t } = useTranslation('inventory')
  const isOver = tankerRemaining !== null && tankerRemaining < 0
  return (
    <FormGrid>
      <FormField label={t('header.date')}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} data-autofocus />
      </FormField>
      <FormField label={t('header.invoice')}>
        <input type="text" value={invoice} onChange={e => setInvoice(e.target.value)} />
      </FormField>

      {tankers.length > 0 && (
        <FormGridFullRow>
          <span className="ui-label">{t('header.tanker')}</span>
          <SearchableSelect label={t('header.tanker')}
            value={selectedTankerId !== null ? String(selectedTankerId) : ''}
            onChange={v => setSelectedTankerId(v ? Number(v) : null)}
            options={[
              { value: '', label: t('header.noTanker') },
              ...tankers.map(tanker => ({
                value: String(tanker.id),
                label: t(tanker.defaultTanker ? 'header.tankerOptionDefault' : 'header.tankerOption', { name: tanker.name, capacity: formatNumberIn(tanker.capacityLitres) }),
              })),
            ]}
            placeholder={t('header.selectTanker')}
          />
          {selectedTanker && (
            <LiveFigures
              label={t('header.tankerFigures')}
              className="mt-2"
              figures={[
                { label: t('header.capacity'), value: <LitresText value={selectedTanker.capacityLitres} /> },
                { label: t('header.entered'), value: <LitresText value={totalEnteredQty > 0 ? totalEnteredQty : null} /> },
                {
                  label: isOver ? t('header.over') : t('header.remaining'),
                  value: <LitresText value={tankerRemaining === null ? null : Math.abs(tankerRemaining)}
                    tone={tankerMismatch && isOver ? 'bad' : undefined} />,
                  isResult: true,
                },
              ]}
            />
          )}
        </FormGridFullRow>
      )}
    </FormGrid>
  )
}
