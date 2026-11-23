import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CreditClientSummary } from '../../../api/pumpApi'
import type { CreditEntry, Shift } from '../../../types/shift'
import { CreditEntryForm } from '../components/CreditEntryForm'
import { fmt } from '../components/creditRow'
import type { CreditRow } from '../components/creditRow'
import { PreRecordedCreditList } from './PreRecordedCreditList'
import { Section } from './CloseShiftFields'

interface Props {
  shift: Shift
  preRecordedEntries: CreditEntry[]
  preRecordedTotal: number
  onEditRecorded: (entry: CreditEntry) => void
  onVoidedRecorded: (entryId: number) => void
  creditRows: CreditRow[]
  newCreditTotal: number
  expandedRowId: number | null
  onExpandedChange: (rowId: number | null) => void
  creditClients: CreditClientSummary[]
  availableFuelTypes: string[]
  priceForFuelType: (fuelType: string) => number | null
  onAddRow: () => void
  onUpdateRow: <K extends keyof CreditRow>(rowId: number, field: K, value: CreditRow[K]) => void
  onUpdateRowMulti: (rowId: number, updates: Partial<CreditRow>) => void
  onSelectClient: (rowId: number, clientId: number, clientName: string) => void
  onRemoveRow: (rowId: number) => void
}

export function CreditSalesSection({
  shift, preRecordedEntries, preRecordedTotal, onEditRecorded, onVoidedRecorded,
  creditRows, newCreditTotal, expandedRowId, onExpandedChange, creditClients, availableFuelTypes, priceForFuelType,
  onAddRow, onUpdateRow, onUpdateRowMulti, onSelectClient, onRemoveRow,
}: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const hasEntries = preRecordedEntries.length > 0 || creditRows.length > 0

  return (
    <Section label="2" title={t('close.sections.creditSales')} optional>
      <div className="overflow-visible rounded-card border border-border">
        {preRecordedEntries.length > 0 && (
          <PreRecordedCreditList
            shift={shift}
            entries={preRecordedEntries}
            total={preRecordedTotal}
            onEdit={onEditRecorded}
            onVoided={onVoidedRecorded}
          />
        )}

        {creditRows.length > 0 && (
          <div className="divide-y divide-border border-b border-border">
            {creditRows.map((row, idx) => (
              <CreditEntryForm
                key={row.id}
                row={row}
                rowNumber={idx + 1}
                isExpanded={expandedRowId === row.id}
                onExpandedChange={onExpandedChange}
                creditClients={creditClients}
                availableFuelTypes={availableFuelTypes}
                priceForFuelType={priceForFuelType}
                onUpdate={(field, value) => onUpdateRow(row.id, field, value)}
                onUpdateMulti={(updates) => onUpdateRowMulti(row.id, updates)}
                onSelectClient={(clientId, clientName) => onSelectClient(row.id, clientId, clientName)}
                onRemove={() => onRemoveRow(row.id)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-xs text-ink-3">
            {creditRows.length > 0
              ? t('close.newEntries', { count: creditRows.length, amount: fmt(newCreditTotal) })
              : hasEntries ? null : t('close.noCredit')}
          </span>
          <button type="button" onClick={onAddRow} className="ui-btn ui-btn-secondary ui-btn-compact shrink-0 gap-1">
            <Plus size={14} aria-hidden="true" />{t('close.addEntry')}
          </button>
        </div>
      </div>
    </Section>
  )
}
