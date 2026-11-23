import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import type { ShiftPlanning } from './useShiftPlanning'

export function GeneratePlanModal({ form }: { form: ShiftPlanning }) {
  const { t } = useTranslation(['shifts', 'common'])
  const { showGenerate, setShowGenerate, genDayOps, setGenDayOps, genNightOps, setGenNightOps, genError, generateMutation } = form
  if (!showGenerate) return null
  return (
    <Modal
      title={t('planning.generate.title')}
      subtitle={t('planning.generate.subtitle')}
      tone="info"
      size="md"
      onClose={() => setShowGenerate(false)}
      canClose={!generateMutation.isPending}
      onSubmit={(e) => { e.preventDefault(); generateMutation.mutate() }}
      bodyClassName="space-y-3"
      footer={
        <>
          <button type="button" onClick={() => setShowGenerate(false)} disabled={generateMutation.isPending}
            className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={generateMutation.isPending}
            loadingLabel={t('common:actions.generating')} className="ui-btn-primary">
            {t('planning.generate.submit')}
          </LoadingButton>
        </>
      }
    >
      <FormGrid>
        <FormField label={t('planning.generate.dayOperators')}>
          <NumericInput min="1" max="20" step="1" inputMode="numeric" value={genDayOps} data-autofocus
            onChange={e => setGenDayOps(e.target.value)} />
        </FormField>
        <FormField label={t('planning.generate.nightOperators')}>
          <NumericInput min="1" max="20" step="1" inputMode="numeric" value={genNightOps}
            onChange={e => setGenNightOps(e.target.value)} />
        </FormField>
      </FormGrid>
      {genError && <p role="alert" className="ui-error-text">{genError}</p>}
    </Modal>
  )
}
