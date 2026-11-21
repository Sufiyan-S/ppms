import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { superAdminApi } from '../../api/superAdminApi'
import type { OnboardOwnerResponse } from '../../api/superAdminApi'
import { PasswordInput } from '../../components/PasswordInput'
import { FormField } from '../../components/FormField'
import { parseApiError } from '../../utils/apiError'
import { onboardSchema } from './superAdminSchemas'
import type { OnboardFormData, OnboardFormInput } from './superAdminSchemas'

interface OnboardOwnerFormProps {
  onSubmitStart: () => void
  onCreated: (owner: OnboardOwnerResponse, password: string) => void
}

export function OnboardOwnerForm({ onSubmitStart, onCreated }: OnboardOwnerFormProps) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OnboardFormInput, unknown, OnboardFormData>({
    resolver: zodResolver(onboardSchema),
  })

  const onboardMutation = useMutation({
    mutationFn: superAdminApi.onboardOwner,
    onSuccess: (data, variables) => {
      onCreated(data, variables.password)
      setServerError(null)
      reset()
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
    },
    onError: (err) => {
      setServerError(parseApiError(err, 'Failed to create owner. Please try again.'))
    },
  })

  const onSubmit = (data: OnboardFormData) => {
    setServerError(null)
    onSubmitStart()
    onboardMutation.mutate(data)
  }

  return (
    <div className="lg:col-span-2">
      <div className="ui-card p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Onboard New Owner</h2>
          <p className="text-xs text-slate-500 mt-0.5">Creates the owner account and their first pump.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">

          <fieldset>
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Owner Details
            </legend>
            <div className="space-y-3">
              <FormField label="Full Name" error={errors.fullName?.message}>
                <input
                  {...register('fullName')}
                  type="text"
                  placeholder="e.g. Ramesh Sharma"
                  className="text-sm"
                />
              </FormField>

              <FormField label="Phone Number" error={errors.phoneNumber?.message}>
                <input
                  {...register('phoneNumber')}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  className="text-sm"
                />
              </FormField>

              <FormField label="Initial Password" error={errors.password?.message}>
                <PasswordInput
                  {...register('password')}
                  placeholder="Min. 6 characters"
                  className="text-sm"
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Pump Details
            </legend>
            <div className="space-y-3">
              <FormField label="Pump Name" error={errors.pumpName?.message}>
                <input
                  {...register('pumpName')}
                  type="text"
                  placeholder="e.g. Sharma Petrol Station"
                  className="text-sm"
                />
              </FormField>

              <FormField label="Pump Address" error={errors.pumpAddress?.message}>
                <input
                  {...register('pumpAddress')}
                  type="text"
                  placeholder="Full address"
                  className="text-sm"
                />
              </FormField>

              <FormField label="Max DU Count" error={errors.maxDuCount?.message}>
                <input
                  {...register('maxDuCount')}
                  type="number"
                  min={1}
                  max={20}
                  placeholder="e.g. 4"
                  className="text-sm"
                />
              </FormField>
            </div>
          </fieldset>

          {serverError && (
            <div role="alert" className="ui-alert ui-alert-danger">
              <p className="text-red-600 text-sm">{serverError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={onboardMutation.isPending}
            className="ui-btn ui-btn-primary w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {onboardMutation.isPending ? 'Creating...' : 'Create Owner & Pump'}
          </button>
        </form>
      </div>
    </div>
  )
}
