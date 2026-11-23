import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { OperatorPicker } from '../components/OperatorPicker'
import { maxDate, minDate } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

export function ShiftDetailsSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation(['shifts', 'common'])
  const windowLabelId = useId()
  const {
    shiftDate, setShiftDate, shiftDefinitionId, setShiftDefinitionId, setFuelRateInputs, defsLoading, definitions,
    operatorId, setOperatorId, operatorSearch, setOperatorSearch, operatorsLoading, filteredOperators,
  } = form
  return (
    <div className="space-y-4">
      <FormGrid>
        <FormField label={t('backfill.details.shiftDate')} help={t('backfill.details.dateHint')}>
          <input
            type="date"
            value={shiftDate}
            min={minDate()}
            max={maxDate()}
            onChange={(e) => { setShiftDate(e.target.value); setShiftDefinitionId(null); setFuelRateInputs({}) }}
            data-autofocus
            required
          />
        </FormField>

        <div>
          <span id={windowLabelId} className="ui-label">{t('backfill.details.window')}</span>
          {definitions.length === 0 && !defsLoading ? (
            <p className="ui-alert ui-alert-warning text-sm">{t('backfill.details.noDefinitions')}</p>
          ) : (
            <SearchableSelect aria-labelledby={windowLabelId}
              value={String(shiftDefinitionId ?? '')}
              onChange={(v) => setShiftDefinitionId(v ? Number(v) : null)}
              options={definitions.map((def) => ({ value: String(def.id), label: `${def.name} · ${def.windowLabel}` }))}
              placeholder={defsLoading ? t('backfill.details.loadingWindows') : t('backfill.details.selectWindow')}
              disabled={defsLoading}
            />
          )}
        </div>
      </FormGrid>

      <OperatorPicker
        title={t('backfill.staff.operator')}
        showStepNumber={false}
        operatorsLoading={operatorsLoading}
        noneAvailable={filteredOperators.length === 0 && operatorSearch === ''}
        filteredOperators={filteredOperators}
        operatorSearch={operatorSearch}
        onSearchChange={setOperatorSearch}
        selectedOperatorId={operatorId}
        onSelect={(id) => { setOperatorId(id); setOperatorSearch('') }}
      />
    </div>
  )
}
