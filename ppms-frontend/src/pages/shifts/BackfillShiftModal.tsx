import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscardChangesDialog } from '../../components/DiscardChangesDialog'
import { Modal } from '../../components/Modal'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { BackfillShiftModalProps } from './backfill/backfillHelpers'
import { useBackfillForm } from './backfill/useBackfillForm'
import { ShiftDetailsSection } from './backfill/ShiftDetailsSection'
import { StaffNozzlesSection } from './backfill/StaffNozzlesSection'
import { FuelRatesSection } from './backfill/FuelRatesSection'
import { MeterReadingsSection } from './backfill/MeterReadingsSection'
import { CreditSalesSection } from './backfill/CreditSalesSection'
import { PaymentSection } from './backfill/PaymentSection'
import { DiscrepancyReasonSection } from './backfill/DiscrepancyReasonSection'
import { BackfillSummary } from './backfill/BackfillSummary'
import { Section } from './close/CloseShiftFields'

/** From this width the live summary sits beside the form, as on Close shift. */
const SIDE_SUMMARY_QUERY = '(min-width: 900px)'

export default function BackfillShiftModal({ pumpId, onClose }: BackfillShiftModalProps) {
  const { t } = useTranslation(['shifts', 'common'])
  const form = useBackfillForm({ pumpId, onClose })
  const { error, handleSubmit, isPending, requestClose, isConfirming, discard, keepEditing, canSubmit } = form
  const stillNeededId = useId()
  const summaryBesideForm = useMediaQuery(SIDE_SUMMARY_QUERY)

  const stillNeeded = [
    !form.shiftDate && t('backfill.stillNeeded.date'),
    !form.shiftDefinitionId && t('backfill.stillNeeded.window'),
    !form.operatorId && t('backfill.stillNeeded.operator'),
    !form.selectedDU && t('backfill.stillNeeded.du'),
    form.selectedNozzleIds.size === 0 && t('backfill.stillNeeded.nozzle'),
  ].filter((item): item is string => typeof item === 'string')

  return (
    <>
      <Modal
        title={t('backfill.title')}
        subtitle={t('backfill.subtitle')}
        tone="info"
        size="full"
        fullScreenOnPhone
        onClose={requestClose}
        canClose={!isPending}
        closeOnBackdropClick
        confirmDiscard={false}
        onSubmit={handleSubmit}
        footer={
          <>
            <StillNeeded id={stillNeededId} items={stillNeeded} />
            <button type="button" onClick={requestClose} disabled={isPending} className="ui-btn ui-btn-secondary">
              {t('common:actions.cancel')}
            </button>
            <LoadingButton
              type="submit"
              disabled={!canSubmit}
              aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
              isLoading={isPending}
              loadingLabel={t('common:actions.saving')}
              className="ui-btn-primary"
            >
              {t('backfill.save')}
            </LoadingButton>
          </>
        }
      >
        <div className={summaryBesideForm ? 'ui-close-layout' : undefined}>
          <div className="min-w-0 space-y-6">
            <p className="ui-help mt-0">{t('backfill.deliveriesFirst')}</p>
            <Section label="1" title={t('backfill.details.title')}>
              <ShiftDetailsSection form={form} />
            </Section>
            <Section label="2" title={t('backfill.meter.title')}>
              <div className="space-y-4">
                <StaffNozzlesSection form={form} />
                <FuelRatesSection form={form} />
                <MeterReadingsSection form={form} />
              </div>
            </Section>
            <Section label="3" title={t('backfill.credit.title')} optional>
              <CreditSalesSection form={form} />
            </Section>
            <Section label="4" title={t('backfill.payment.title')}>
              <div className="space-y-4">
                <PaymentSection form={form} />
                {!summaryBesideForm && <BackfillSummary form={form} />}
                <DiscrepancyReasonSection form={form} />
              </div>
            </Section>
            {error && (
              <p role="alert" className="ui-alert ui-alert-danger">{error}</p>
            )}
          </div>
          {summaryBesideForm && (
            <aside className="sticky top-0">
              <BackfillSummary form={form} />
            </aside>
          )}
        </div>
      </Modal>
      {isConfirming && <DiscardChangesDialog formName={t('backfill.title')} onDiscard={discard} onKeepEditing={keepEditing} />}
    </>
  )
}
