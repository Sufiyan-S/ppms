import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { superAdminApi } from '../../api/superAdminApi'
import type { AddPumpRequest, OwnerSummary } from '../../api/superAdminApi'
import { FormField } from '../../components/FormField'
import { parseApiError } from '../../utils/apiError'
import { addPumpSchema } from './superAdminSchemas'
import type { AddPumpFormData, AddPumpFormInput } from './superAdminSchemas'

interface AddPumpFormProps {
  owner: OwnerSummary
  onDone: () => void
}

export function AddPumpForm({ owner, onDone }: AddPumpFormProps) {
  const queryClient = useQueryClient()
  const [addPumpError, setAddPumpError] = useState<string | null>(null)

  const {
    register: registerPump,
    handleSubmit: handleSubmitPump,
    formState: { errors: pumpErrors },
  } = useForm<AddPumpFormInput, unknown, AddPumpFormData>({
    resolver: zodResolver(addPumpSchema),
  })

  const addPumpMutation = useMutation({
    mutationFn: ({ ownerId, data }: { ownerId: number; data: AddPumpRequest }) =>
      superAdminApi.addPumpToOwner(ownerId, data),
    onSuccess: () => {
      onDone()
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
      queryClient.invalidateQueries({ queryKey: ['superadmin-analytics'] })
    },
    onError: (err) =>
      setAddPumpError(parseApiError(err, 'Failed to add pump. Please try again.')),
  })

  const onAddPumpSubmit = (data: AddPumpFormData) => {
    setAddPumpError(null)
    addPumpMutation.mutate({ ownerId: owner.ownerId, data })
  }

  return (
    <div className="px-5 pb-4 bg-indigo-50/50 border-t border-indigo-100">
      <div className="pt-3">
      <form onSubmit={handleSubmitPump(onAddPumpSubmit)} className="ui-inline-form space-y-3 max-w-md">
        <div>
          <p className="ui-inline-form__title">Add a new pump for {owner.fullName}</p>
          <p className="ui-inline-form__copy">Create another managed location under this owner without leaving the owner list.</p>
        </div>
        <FormField label="Pump Name" error={pumpErrors.pumpName?.message}>
          <input
            {...registerPump('pumpName')}
            type="text"
            placeholder="e.g. Jatin Petrol Station 2"
            className="text-sm"
          />
        </FormField>
        <FormField label="Pump Address" error={pumpErrors.pumpAddress?.message}>
          <input
            {...registerPump('pumpAddress')}
            type="text"
            placeholder="Full address"
            className="text-sm"
          />
        </FormField>
        <FormField label="Max DU Count" error={pumpErrors.maxDuCount?.message}>
          <input
            {...registerPump('maxDuCount')}
            type="number"
            min={1}
            max={20}
            placeholder="e.g. 4"
            className="text-sm"
          />
        </FormField>
        {addPumpError && (
          <p role="alert" className="ui-error-text">{addPumpError}</p>
        )}
        <button
          type="submit"
          disabled={addPumpMutation.isPending}
          className="ui-btn ui-btn-primary bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {addPumpMutation.isPending ? 'Adding…' : 'Add Pump'}
        </button>
      </form>
      </div>
    </div>
  )
}
