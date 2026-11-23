import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { codeLabel } from '../../../constants/labels'
import type { BackfillForm } from './useBackfillForm'

/** The dispensary unit and which of its nozzles the shift covered. */
export function StaffNozzlesSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation(['shifts', 'common'])
  const duLabelId = useId()
  const nozzlesLabelId = useId()
  const { selectedDU, dus, dusLoading, selectDU, selectedNozzleIds, availableNozzles, toggleNozzle } = form
  return (
    <div className="space-y-4">
      <div>
        <span id={duLabelId} className="ui-label">{t('backfill.details.du')}</span>
        <SearchableSelect aria-labelledby={duLabelId}
          value={String(selectedDU?.id ?? '')}
          onChange={(v) => selectDU(dus.find((d) => String(d.id) === v) ?? null)}
          options={dus.map((du) => ({ value: String(du.id), label: t('backfill.details.duOption', { name: du.name, number: du.duNumber }) }))}
          placeholder={dusLoading ? t('common:loading.short') : t('backfill.details.selectDu')}
          disabled={dusLoading}
        />
      </div>

      {selectedDU && (
        <div>
          <span id={nozzlesLabelId} className="ui-label">{t('backfill.staff.nozzles')}</span>
          {availableNozzles.length === 0 ? (
            <p className="ui-help mt-0">{t('backfill.staff.noNozzles')}</p>
          ) : (
            <div role="group" aria-labelledby={nozzlesLabelId} className="flex flex-wrap gap-2">
              {availableNozzles.map((nozzle) => {
                const selected = selectedNozzleIds.has(nozzle.id)
                return (
                  <button
                    key={nozzle.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleNozzle(nozzle.id)}
                    className={`min-h-11 rounded-control border px-3 text-sm font-medium transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-on-primary'
                        : 'border-control bg-surface text-ink-2 hover:border-primary hover:text-primary'
                    }`}
                  >
                    #{nozzle.nozzleNumber} · {codeLabel(nozzle.fuelType)}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
