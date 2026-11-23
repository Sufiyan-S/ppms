import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { userApi } from '../../../api/userApi'
import type { Shift } from '../../../types/shift'
import { OperatorPicker } from '../components/OperatorPicker'
import { Section } from './CloseShiftFields'
import type { HandoverDetails } from './handoverDetails'

interface Props {
  shift: Shift
  activeShifts: Shift[]
  details: HandoverDetails
  onChange: (details: HandoverDetails) => void
}

export function HandoverFields({ shift, activeShifts, details, onChange }: Props) {
  const { t } = useTranslation('shifts')
  const [operatorSearch, setOperatorSearch] = useState('')

  const { data: operators = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['operators', shift.pumpId],
    queryFn:  () => userApi.getOperators(shift.pumpId),
  })

  const busyOperatorIds = new Set(activeShifts.map((s) => s.operatorId))
  const availableOperators = operators.filter((o) => o.id !== shift.operatorId && !busyOperatorIds.has(o.id))
  const filteredOperators = availableOperators.filter((o) =>
    o.fullName.toLowerCase().includes(operatorSearch.toLowerCase())
  )

  return (
    <Section label="0" title={t('handover.fields.title')}>
      <div className="space-y-3">
        <p className="rounded-card border border-info bg-info-bg px-3 py-2 text-xs text-info">
          {t('handover.fields.explainer', { name: shift.operatorName })}
        </p>
        <OperatorPicker
          title={t('handover.fields.chooseIncoming')}
          showStepNumber={false}
          operatorsLoading={operatorsLoading}
          noneAvailable={availableOperators.length === 0}
          filteredOperators={filteredOperators}
          operatorSearch={operatorSearch}
          onSearchChange={setOperatorSearch}
          selectedOperatorId={details.incomingOperatorId}
          onSelect={(operatorId) => onChange({ ...details, incomingOperatorId: operatorId })}
        />
        <label className="ui-check-row">
          <input type="checkbox" checked={details.physicalCashVerified}
            onChange={(e) => onChange({ ...details, physicalCashVerified: e.target.checked })} />
          {t('handover.fields.cashCounted')}
        </label>
        <label className="ui-check-row">
          <input type="checkbox" checked={details.meterReadingsVerified}
            onChange={(e) => onChange({ ...details, meterReadingsVerified: e.target.checked })} />
          {t('handover.fields.metersChecked')}
        </label>
        <label className="block">
          <span className="ui-label">{t('handover.fields.notes')}</span>
          <input type="text" value={details.notes} maxLength={1000}
            onChange={(e) => onChange({ ...details, notes: e.target.value })}
            className="text-sm" placeholder={t('handover.fields.notesPlaceholder')} />
        </label>
      </div>
    </Section>
  )
}
