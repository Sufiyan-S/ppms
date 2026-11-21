import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { PumpSummary, UpdatePumpRequest } from '../../api/superAdminApi'
import { FormField } from '../../components/FormField'
import { editPumpSchema } from './superAdminSchemas'
import type { EditPumpFormData, EditPumpFormInput } from './superAdminSchemas'

interface EditPumpFormProps {
  pump: PumpSummary
  isSaving: boolean
  error: string | null
  onSave: (data: UpdatePumpRequest) => void
}

export function EditPumpForm({ pump, isSaving, error, onSave }: EditPumpFormProps) {
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: editErrors },
  } = useForm<EditPumpFormInput, unknown, EditPumpFormData>({
    resolver: zodResolver(editPumpSchema),
    defaultValues: { pumpName: pump.pumpName, pumpAddress: pump.pumpAddress },
  })

  function onEditPumpSubmit(data: EditPumpFormData) {
    onSave({ pumpName: data.pumpName, pumpAddress: data.pumpAddress, enabled: pump.enabled })
  }

  return (
    <form
      onSubmit={handleSubmitEdit(onEditPumpSubmit)}
      className="mt-2 ui-card-plain bg-white border-indigo-100 p-3 space-y-2"
    >
      <FormField label="Pump Name" error={editErrors.pumpName?.message}>
        <input
          {...registerEdit('pumpName')}
          type="text"
          className="text-xs min-h-10"
        />
      </FormField>
      <FormField label="Pump Address" error={editErrors.pumpAddress?.message}>
        <input
          {...registerEdit('pumpAddress')}
          type="text"
          className="text-xs min-h-10"
        />
      </FormField>
      {error && (
        <p role="alert" className="ui-error-text">{error}</p>
      )}
      <button
        type="submit"
        disabled={isSaving}
        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300"
      >
        {isSaving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}
