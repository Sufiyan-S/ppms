import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import type { PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LoadingButton } from '../../components/LoadingButton'
import { editPumpSchema } from './superAdminSchemas'
import type { EditPumpFormData, EditPumpFormInput } from './superAdminSchemas'

interface EditPumpFormProps {
  pump: PumpSummary
  isSaving: boolean
  error: string | null
  onSave: (data: UpdatePumpRequest) => void
  onCancel: () => void
}

export function EditPumpForm({ pump, isSaving, error, onSave, onCancel }: EditPumpFormProps) {
  const { t } = useTranslation(['superadmin', 'common'])
  const schema = useMemo(() => editPumpSchema(t), [t])
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: editErrors },
  } = useForm<EditPumpFormInput, unknown, EditPumpFormData>({
    resolver: zodResolver(schema),
    defaultValues: { pumpName: pump.pumpName, pumpAddress: pump.pumpAddress },
  })

  function onEditPumpSubmit(data: EditPumpFormData) {
    onSave({ pumpName: data.pumpName, pumpAddress: data.pumpAddress, enabled: pump.enabled })
  }

  return (
    <form
      onSubmit={handleSubmitEdit(onEditPumpSubmit)}
      aria-label={t('pump.editTitle', { name: pump.pumpName })}
      className="mt-3 space-y-3 border-t border-border pt-3"
    >
      <FormGrid>
        <FormField label={t('fields.pumpName')} error={editErrors.pumpName?.message}>
          <input {...registerEdit('pumpName')} type="text" className="text-sm" />
        </FormField>
        <FormField label={t('fields.pumpAddress')} error={editErrors.pumpAddress?.message}>
          <input {...registerEdit('pumpAddress')} type="text" className="text-sm" />
        </FormField>
      </FormGrid>
      {error && (
        <p role="alert" className="ui-error-text">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <LoadingButton type="submit" isLoading={isSaving} loadingLabel={t('common:actions.saving')} className="ui-btn-primary ui-btn-compact">
          {t('pump.saveChanges')}
        </LoadingButton>
        <button type="button" onClick={onCancel} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  )
}
