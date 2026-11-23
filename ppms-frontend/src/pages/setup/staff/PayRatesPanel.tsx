import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { FormField } from '../../../components/FormField'
import { NumericInput } from '../../../components/NumericInput'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { RowPanel, RowPanelActions } from './RowPanel'

interface Props {
  pumpId: number
  member: StaffMember
  onClose: () => void
}

/** Every shift on the clock (12 AM–8 AM, 8 AM–4 PM, 4 PM–12 AM) is eight hours long. */
const SHIFT_HOURS = 8
/** A month with one day off a week, for the example pay under the daily rate. */
const EXAMPLE_WORKING_DAYS = 26

const rateText = (rate: number | null | undefined) => (rate != null ? String(rate) : '')

/** The rate times a count, or null while the rate is empty or not a number, so the figure reads "—". */
function payFor(rate: string, count: number): number | null {
  const value = parseFloat(rate)
  return rate === '' || Number.isNaN(value) ? null : value * count
}

export function PayRatesPanel({ pumpId, member, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const stillNeededId = useId()
  const [rateShift1, setRateShift1]       = useState(rateText(member.shift1HourlyRate))
  const [rateStandard, setRateStandard]   = useState(rateText(member.standardHourlyRate))
  const [rateDaily, setRateDaily]         = useState(rateText(member.dailyRate))
  const [rateError, setRateError]         = useState<string | null>(null)
  const isOperator = member.role === 'OPERATOR'

  const rateMutation = useMutation({
    mutationFn: ({ userId, shift1HourlyRate, standardHourlyRate, dailyRate }: { userId: number; shift1HourlyRate?: number; standardHourlyRate?: number; dailyRate?: number }) =>
      userApi.updatePayRates(userId, { shift1HourlyRate, standardHourlyRate, dailyRate }),
    onSuccess: () => {
      setRateError(null)
      onClose()
      queryClient.invalidateQueries({ queryKey: ['staff', pumpId] })
    },
    onError: (err) => setRateError(parseApiError(err, t('staff.rates.failed'))),
  })

  const stillNeeded = isOperator
    ? [...(!rateShift1 ? [t('staff.rates.night')] : []), ...(!rateStandard ? [t('staff.rates.day')] : [])]
    : (!rateDaily ? [t('staff.rates.daily')] : [])

  const save = () => rateMutation.mutate(isOperator
    ? { userId: member.id, shift1HourlyRate: parseFloat(rateShift1), standardHourlyRate: parseFloat(rateStandard) }
    : { userId: member.id, dailyRate: parseFloat(rateDaily) })

  return (
    <RowPanel
      title={isOperator ? t('staff.rates.hourlyTitle', { name: member.fullName }) : t('staff.rates.dailyTitle', { name: member.fullName })}
      hint={isOperator ? t('staff.rates.hourlyHint') : t('staff.rates.dailyHint')}
    >
      {isOperator ? (
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <FormField label={t('staff.rates.night')}>
            <NumericInput min="1" step="0.01" unit="₹/hr" value={rateShift1} onChange={e => setRateShift1(e.target.value)} />
          </FormField>
          <FormField label={t('staff.rates.day')}>
            <NumericInput min="1" step="0.01" unit="₹/hr" value={rateStandard} onChange={e => setRateStandard(e.target.value)} />
          </FormField>
        </div>
      ) : (
        <div className="max-w-44">
          <FormField label={t('staff.rates.daily')}>
            <NumericInput min="1" step="0.01" unit="₹/day" value={rateDaily} onChange={e => setRateDaily(e.target.value)} />
          </FormField>
        </div>
      )}

      <LiveFigures
        label={t('staff.rates.exampleTitle')}
        className="max-w-sm"
        figures={isOperator ? [
          { label: t('staff.rates.nightShiftPay', { hours: SHIFT_HOURS }), value: <MoneyText value={payFor(rateShift1, SHIFT_HOURS)} /> },
          { label: t('staff.rates.dayShiftPay', { hours: SHIFT_HOURS }), value: <MoneyText value={payFor(rateStandard, SHIFT_HOURS)} /> },
        ] : [
          { label: t('staff.rates.monthPay', { days: EXAMPLE_WORKING_DAYS }), value: <MoneyText value={payFor(rateDaily, EXAMPLE_WORKING_DAYS)} /> },
        ]}
      />

      {rateError && <p role="alert" className="ui-error-text">{rateError}</p>}
      <RowPanelActions>
        <LoadingButton
          type="button"
          isLoading={rateMutation.isPending}
          loadingLabel={t('common:actions.saving')}
          disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          onClick={save}
          className="ui-btn-primary ui-btn-compact"
        >
          {isOperator ? t('staff.rates.saveRates') : t('staff.rates.saveRate')}
        </LoadingButton>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
      </RowPanelActions>
    </RowPanel>
  )
}
