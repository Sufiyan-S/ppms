import { useId } from 'react'
import { X } from 'lucide-react'
import { codeLabel } from '../../../constants/labels'
import { useTranslation } from 'react-i18next'
import { formatNumberIn } from '../../../i18n/format'
import { formatDecimal } from '../../../utils/format'
import type { TankStock } from '../../../api/inventoryApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { NumericInput } from '../../../components/NumericInput'
import { FormField } from '../../../components/FormField'
import { LiveFigures } from '../../../components/LiveFigures'
import type { LiveFigure } from '../../../components/LiveFigures'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { limitDecimals } from '../inventoryFormat'
import type { DeliveryRow } from './deliveryRows'

interface Props {
  row: DeliveryRow
  rowNumber: number
  tanks: TankStock[]
  tankOptions: { value: string; label: string }[]
  isOwnerOrAdmin: boolean
  isExpanded: boolean
  onExpandedChange: (rowId: number | null) => void
  canRemove: boolean
  onRemove: () => void
  onChange: (field: keyof Omit<DeliveryRow, 'id'>, value: string) => void
}

export function DeliveryRowEditor({
  row, rowNumber, tanks, tankOptions, isOwnerOrAdmin, isExpanded, onExpandedChange, canRemove, onRemove, onChange,
}: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const headingId = useId()
  const tank          = tanks.find(t => t.tankId === Number(row.tankId))
  const enteredQty    = parseFloat(row.qty) || 0
  const enteredCost   = parseFloat(row.costPrice) || 0
  const rowCost       = isOwnerOrAdmin ? enteredQty * enteredCost : 0
  const afterStock    = tank ? tank.currentStock + enteredQty : null
  const availableSpace = tank && tank.capacity > 0 ? tank.capacity - tank.currentStock : null
  const rowOverflow   = availableSpace !== null && enteredQty > 0 && enteredQty > availableSpace
  const isFilled      = !!row.tankId && enteredQty > 0 && (isOwnerOrAdmin ? enteredCost > 0 : true)

  if (!isExpanded) {
    return (
      <div className={`ui-card flex items-center justify-between gap-3 px-4 py-3 ${rowOverflow ? 'border-bad' : 'ui-card-muted'}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-ink-3 shrink-0">#{rowNumber}</span>
          {isFilled ? (
            <>
              <span className="text-sm font-medium text-ink truncate">
                {tank?.tankIdentifier ?? '—'} · {codeLabel(tank?.fuelType)}
              </span>
              <LitresText value={enteredQty} className="text-xs text-ink-2" />
              {rowOverflow && <span className="text-xs font-semibold text-bad">{t('row.overCapacity')}</span>}
              {!rowOverflow && isOwnerOrAdmin && rowCost > 0 && (
                <MoneyText value={rowCost} className="text-sm font-semibold text-ink" />
              )}
            </>
          ) : (
            <span className="text-xs text-ink-3">{t('row.incomplete')}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onExpandedChange(row.id)} className="ui-text-action">
            {t('common:actions.edit')}
          </button>
          {canRemove && (
            <IconButton
              onClick={onRemove}
              className="ui-btn ui-btn-ghost"
              label={t('row.removeRow')}
              icon={<X size={14} strokeWidth={2} />}
            />
          )}
        </div>
      </div>
    )
  }

  const figures: LiveFigure[] = [
    ...(isOwnerOrAdmin ? [{
      label: t('row.deliveryCost'),
      value: <MoneyText value={enteredQty > 0 && enteredCost > 0 ? rowCost : null} />,
    }] : []),
    ...(tank && availableSpace !== null ? [{
      label: t('row.freeSpace'),
      value: <LitresText value={availableSpace} />,
    }] : []),
    ...(afterStock !== null ? [{
      label: t('row.stockAfter'),
      value: rowOverflow
        ? <span className="font-semibold text-bad">{t('row.overCapacity')}</span>
        : (
          <span>
            <LitresText value={enteredQty > 0 ? afterStock : null} />
            {tank && tank.capacity > 0 && enteredQty > 0 && (
              <span className="text-ink-3"> {t('row.ofCapacity', { capacity: formatNumberIn(tank.capacity, { minimumFractionDigits: 0 }) })}</span>
            )}
          </span>
        ),
      isResult: true,
    }] : []),
  ]

  return (
    <section aria-labelledby={headingId} className={`ui-card space-y-3 p-4 ${rowOverflow ? 'border-bad' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-ink">{t('row.tankNumber', { number: rowNumber })}</h3>
        {canRemove && (
          <IconButton
            onClick={onRemove}
            className="ui-btn ui-btn-ghost"
            label={t('row.removeRow')}
            icon={<X size={14} strokeWidth={2} />}
          />
        )}
      </div>

      <FormGrid>
        <FormGridFullRow>
          <span className="ui-label">{t('row.tank')}</span>
          <SearchableSelect label={t('row.tank')}
            value={row.tankId}
            onChange={v => onChange('tankId', v)}
            options={tankOptions}
            placeholder={t('row.selectTank')}
          />
        </FormGridFullRow>

        <FormField
          label={t('row.quantity')}
          className={isOwnerOrAdmin ? undefined : 'ui-form-grid__full'}
          error={rowOverflow && availableSpace !== null
            ? t('row.exceedsCapacity', { value: formatDecimal(availableSpace) })
            : undefined}
        >
          <NumericInput
            step="0.001"
            min="0.001"
            unit="L"
            value={row.qty}
            onChange={e => onChange('qty', limitDecimals(e.target.value, 3))}
          />
        </FormField>
        {isOwnerOrAdmin && (
          <FormField label={t('row.costPerLitre')}>
            <NumericInput
              step="0.01"
              min="0.01"
              unit="₹/L"
              value={row.costPrice}
              onChange={e => onChange('costPrice', limitDecimals(e.target.value, 2))}
            />
          </FormField>
        )}
        {!isOwnerOrAdmin && (
          <FormGridFullRow><p className="ui-help mt-0">{t('row.costManaged')}</p></FormGridFullRow>
        )}

        {figures.length > 0 && (
          <FormGridFullRow>
            <LiveFigures label={t('row.figuresLabel', { number: rowNumber })} figures={figures} />
          </FormGridFullRow>
        )}
      </FormGrid>

      {isFilled && (
        <div className="flex justify-end">
          <button type="button" onClick={() => onExpandedChange(null)} className="ui-btn ui-btn-ghost ui-btn-compact">
            {t('common:actions.done')}
          </button>
        </div>
      )}
    </section>
  )
}
