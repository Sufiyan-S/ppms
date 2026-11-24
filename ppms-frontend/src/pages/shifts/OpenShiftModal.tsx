import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { DUOption, NozzleDetail, Shift } from '../../types/shift'
import { Modal } from '../../components/Modal'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { codeLabel } from '../../constants/labels'
import { OperatorPicker } from './components/OperatorPicker'
import { useOpenShiftForm } from './open/useOpenShiftForm'
import { useOpenShiftSteps } from './open/useOpenShiftSteps'
import { OpenShiftProgress } from './open/OpenShiftProgress'
import { OpenShiftSection } from './open/OpenShiftSection'
import { DispenserPicker } from './open/DispenserPicker'
import { NozzlePicker } from './open/NozzlePicker'
import { ReadingsConfirmation } from './open/ReadingsConfirmation'
import { activeNozzlesOf, formatMeterReading } from './open/openShiftNozzles'

interface Props {
  pumpId: number
  activeShifts: Shift[]
  onClose: () => void
  prefilledDuId?: number
  prefilledNozzleIds?: number[]
}

export default function OpenShiftModal({ pumpId, activeShifts, onClose, prefilledDuId, prefilledNozzleIds }: Props) {
  const { t } = useTranslation(['shifts', 'common'])
  const form = useOpenShiftForm({ pumpId, activeShifts, onClose, prefilledDuId, prefilledNozzleIds })
  const doneSteps = {
    du: form.selectedDU !== null,
    nozzles: form.selectedNozzleIds.size > 0,
    operator: form.selectedOperatorId !== null,
  }
  const steps = useOpenShiftSteps(doneSteps)
  const stillNeededId = useId()

  const handleSelectDU = (du: DUOption) => {
    const isNewDu = form.selectDU(du)
    steps.finishStep('du', isNewDu ? { nozzles: false } : {})
  }

  const changeNozzles = (change: () => void) => {
    change()
    steps.keepStepOpen('nozzles')
  }

  const handleSelectOperator = (operatorId: number) => {
    form.selectOperator(operatorId)
    steps.finishStep('operator')
  }

  const nozzleSummary = (nozzle: NozzleDetail) =>
    t('open.nozzleSummary', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType), ...formatMeterReading(nozzle) })

  return (
    <Modal
      title={t('open.title')}
      subtitle={t('open.subtitle')}
      headerExtra={<OpenShiftProgress doneSteps={[doneSteps.du, doneSteps.nozzles, doneSteps.operator, form.readingConfirmed]} />}
      tone="success"
      size="md-wide"
      fullScreenOnPhone
      onClose={onClose}
      canClose={!form.isOpening}
      onSubmit={form.handleSubmit}
      bodyClassName="space-y-3"
      footer={<>
        <StillNeeded id={stillNeededId} items={form.stillNeeded} />
        <button type="button" onClick={onClose} disabled={form.isOpening} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" disabled={form.stillNeeded.length > 0} isLoading={form.isOpening}
          aria-describedby={form.stillNeeded.length > 0 ? stillNeededId : undefined}
          loadingLabel={t('open.opening')} className="ui-btn-primary">
          {t('open.submit')}
        </LoadingButton>
      </>}
    >
      <OpenShiftSection step={1} title={t('open.duHeading')} sectionRef={steps.sectionRef('du')}
        isOpen={steps.openStep === 'du'} isDone={doneSteps.du} pendingHint={t('open.notChosen')}
        onOpen={() => steps.reopenStep('du')}
        summary={form.selectedDU && `${t('open.duNumber', { number: form.selectedDU.duNumber })} · ${form.selectedDU.name}`}>
        <DispenserPicker isLoading={form.dusLoading} dispensers={form.activeDUs}
          busyNozzleOperators={form.busyNozzleOperators} selectedId={form.selectedDU?.id} onSelect={handleSelectDU} />
      </OpenShiftSection>

      <OpenShiftSection step={2} title={t('open.nozzlesHeading')} sectionRef={steps.sectionRef('nozzles')}
        isOpen={steps.openStep === 'nozzles' && form.selectedDU !== null} isDone={doneSteps.nozzles}
        pendingHint={form.selectedDU ? t('open.notChosen') : t('open.pickDuFirst')}
        onOpen={form.selectedDU ? () => steps.reopenStep('nozzles') : undefined}
        summary={<span className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          {form.selectedNozzles.map((nozzle) => <span key={nozzle.id}>{nozzleSummary(nozzle)}</span>)}
        </span>}>
        {form.selectedDU && (
          <NozzlePicker nozzles={activeNozzlesOf(form.selectedDU)} busyNozzleOperators={form.busyNozzleOperators}
            selectedIds={form.selectedNozzleIds} allFreeSelected={form.allFreeNozzlesSelected}
            onToggle={(nozzle) => changeNozzles(() => form.toggleNozzle(nozzle))}
            onSelectAllFree={() => changeNozzles(form.selectAllFreeNozzles)}
            onClear={() => changeNozzles(form.clearNozzles)}
            onContinue={() => steps.finishStep('nozzles')} />
        )}
      </OpenShiftSection>

      <OpenShiftSection step={3} title={t('open.assignOperator')} sectionRef={steps.sectionRef('operator')}
        isOpen={steps.openStep === 'operator'} isDone={doneSteps.operator} pendingHint={t('open.notChosen')}
        onOpen={() => steps.reopenStep('operator')} summary={form.selectedOperator?.fullName}>
        <OperatorPicker
          title={t('open.assignOperator')}
          showStepNumber={false}
          showTitle={false}
          operatorsLoading={form.operatorsLoading}
          noneAvailable={form.availableOperators.length === 0}
          filteredOperators={form.filteredOperators}
          operatorSearch={form.operatorSearch}
          onSearchChange={form.setOperatorSearch}
          selectedOperatorId={form.selectedOperatorId}
          onSelect={handleSelectOperator}
        />
      </OpenShiftSection>

      <OpenShiftSection step={4} title={t('open.readingsHeading')} sectionRef={steps.sectionRef('readings')}
        isOpen isDone={form.readingConfirmed}>
        <ReadingsConfirmation nozzleCount={form.selectedNozzleIds.size} isConfirmed={form.readingConfirmed}
          onConfirmChange={form.confirmReadings} />
      </OpenShiftSection>

      {form.errorMessage && (
        <p role="alert" className="ui-alert ui-alert-danger">{form.errorMessage}</p>
      )}
    </Modal>
  )
}
