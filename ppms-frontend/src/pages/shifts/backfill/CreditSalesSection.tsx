import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { FormField } from '../../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { NumericInput } from '../../../components/NumericInput'
import { MoneyText } from '../../../components/AmountText'
import { FUEL_LABELS } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import type { CreditRow } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

function OptionalLabel({ text }: { text: string }) {
  const { t } = useTranslation('common')
  return <>{text} <span className="font-normal text-ink-3">{t('fields.optionalSuffix')}</span></>
}

function CreditRowEditor({ form, row }: { form: BackfillForm; row: CreditRow }) {
  const { t } = useTranslation(['shifts', 'common'])
  const clientLabelId = useId()
  const { creditClients, creditClientOptions, setExpandedCreditId, removeCreditRow, updateCreditRow } = form
  return (
    <div className="space-y-3 bg-surface-sunken p-3">
      <FormGrid>
        <div>
          <span id={clientLabelId} className="ui-label">{t('backfill.credit.client')}</span>
          <SearchableSelect
            aria-labelledby={clientLabelId}
            value={row.clientId ? String(row.clientId) : ''}
            onChange={(value) => {
              const client = creditClients.find(c => c.id === Number(value))
              updateCreditRow(row._key, { clientId: client?.id ?? null, clientName: client?.name ?? '' })
            }}
            options={creditClientOptions}
            placeholder={t('backfill.credit.selectClient')}
          />
        </div>
        <FormField label={t('backfill.credit.amount')}>
          <NumericInput min="0.01" step="0.01" unit="₹" value={row.amount}
            onChange={(e) => updateCreditRow(row._key, { amount: e.target.value })} />
        </FormField>
        <FormField label={<OptionalLabel text={t('backfill.credit.fuelType')} />}>
          <select value={row.fuelType} onChange={(e) => updateCreditRow(row._key, { fuelType: e.target.value })}>
            <option value="">{t('backfill.credit.optionalChoice')}</option>
            {Object.keys(FUEL_LABELS).map((code) => (
              <option key={code} value={code}>{codeLabel(code)}</option>
            ))}
          </select>
        </FormField>
        <FormField label={<OptionalLabel text={t('backfill.credit.billNo')} />}>
          <input type="text" value={row.billNo} onChange={(e) => updateCreditRow(row._key, { billNo: e.target.value })} />
        </FormField>
        <FormGridFullRow>
          <FormField label={<OptionalLabel text={t('backfill.credit.description')} />}>
            <input type="text" value={row.description}
              onChange={(e) => updateCreditRow(row._key, { description: e.target.value })} />
          </FormField>
        </FormGridFullRow>
      </FormGrid>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => removeCreditRow(row._key)} className="ui-btn ui-btn-ghost ui-btn-compact">
          {t('backfill.credit.removeEntry')}
        </button>
        <button type="button" disabled={!row.clientId || !row.amount} onClick={() => setExpandedCreditId(null)}
          className="ui-btn ui-btn-primary ui-btn-compact">
          {t('common:actions.done')}
        </button>
      </div>
    </div>
  )
}

export function CreditSalesSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { creditRows, expandedCreditId, setExpandedCreditId, creditNum, addCreditRow, removeCreditRow } = form
  return (
    <div className="rounded-card border border-border">
      {creditRows.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {creditRows.map((row) => (
            <li key={row._key}>
              {expandedCreditId === row._key ? (
                <CreditRowEditor form={form} row={row} />
              ) : (
                <div className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {row.clientName || t('backfill.credit.newEntry')}
                  </span>
                  {row.amount && <MoneyText value={parseFloat(row.amount)} className="text-ink" />}
                  <button type="button" onClick={() => setExpandedCreditId(row._key)} className="ui-btn ui-btn-ghost ui-btn-compact">
                    {t('common:actions.edit')}
                  </button>
                  <IconButton onClick={() => removeCreditRow(row._key)} className="ui-btn-icon text-ink-3 hover:text-ink"
                    label={t('backfill.credit.removeLabel')} icon={<X size={14} strokeWidth={2} />} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-xs text-ink-3">
          {creditRows.length > 0
            ? <>{t('backfill.credit.total')} <MoneyText value={creditNum} className="font-semibold text-ink" /></>
            : t('close.noCredit')}
        </span>
        <button type="button" onClick={addCreditRow} className="ui-btn ui-btn-secondary ui-btn-compact shrink-0 gap-1">
          <Plus size={14} aria-hidden="true" />{t('close.addEntry')}
        </button>
      </div>
    </div>
  )
}
