import { useTranslation } from 'react-i18next'
import { FormField } from '../../../components/FormField'
import type { BackfillForm } from './useBackfillForm'

export function DiscrepancyReasonSection({ form }: { form: BackfillForm }) {
  const { t } = useTranslation('shifts')
  const { discrepancyReason, setDiscrepancyReason } = form
  return (
    <FormField label={t('backfill.reason.label')} help={t('backfill.reason.hint')}>
      <textarea
        value={discrepancyReason}
        onChange={(e) => setDiscrepancyReason(e.target.value)}
        rows={2}
        className="resize-none"
      />
    </FormField>
  )
}
