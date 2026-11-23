import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { superAdminApi } from '../../api/superAdminApi'
import type { AddPumpRequest, OwnerSummary } from '../../api/superAdminApi'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { NumericInput } from '../../components/NumericInput'
import { LoadingButton } from '../../components/LoadingButton'
import { parseApiError } from '../../utils/apiError'
import { addPumpSchema } from './superAdminSchemas'
import type { AddPumpFormData, AddPumpFormInput } from './superAdminSchemas'

interface AddPumpFormProps {
  owner: OwnerSummary
  onDone: () => void
}

export function AddPumpForm({ owner, onDone }: AddPumpFormProps) {
  const { t } = useTranslation(['superadmin', 'common'])
  const queryClient = useQueryClient()
  const titleId = useId()
  const [addPumpError, setAddPumpError] = useState<string | null>(null)
  const schema = useMemo(() => addPumpSchema(t), [t])

  const {
    register: registerPump,
    handleSubmit: handleSubmitPump,
    formState: { errors: pumpErrors },
    setFocus,
  } = useForm<AddPumpFormInput, unknown, AddPumpFormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => setFocus('pumpName'), [setFocus])

  const addPumpMutation = useMutation({
    mutationFn: ({ ownerId, data }: { ownerId: number; data: AddPumpRequest }) =>
      superAdminApi.addPumpToOwner(ownerId, data),
    onSuccess: () => {
      onDone()
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
      queryClient.invalidateQueries({ queryKey: ['superadmin-analytics'] })
    },
    onError: (err) =>
      setAddPumpError(parseApiError(err, t('addPump.failed'))),
  })

  const onAddPumpSubmit = (data: AddPumpFormData) => {
    setAddPumpError(null)
    addPumpMutation.mutate({ ownerId: owner.ownerId, data })
  }

  return (
    <form onSubmit={handleSubmitPump(onAddPumpSubmit)} aria-labelledby={titleId} className="ui-inline-form space-y-3">
      <div>
        <h4 id={titleId} className="ui-inline-form__title">{t('addPump.title', { name: owner.fullName })}</h4>
        <p className="ui-inline-form__copy mb-0">{t('addPump.copy')}</p>
      </div>
      <FormGrid>
        <FormField label={t('fields.pumpName')} error={pumpErrors.pumpName?.message}>
          <input {...registerPump('pumpName')} type="text" className="text-sm" />
        </FormField>
        <FormField label={t('fields.maxDuCount')} error={pumpErrors.maxDuCount?.message} help={t('fields.maxDuHelp')}>
          <NumericInput {...registerPump('maxDuCount')} inputMode="numeric" min={1} max={20} step={1} />
        </FormField>
        <FormGridFullRow>
          <FormField label={t('fields.pumpAddress')} error={pumpErrors.pumpAddress?.message}>
            <input {...registerPump('pumpAddress')} type="text" className="text-sm" />
          </FormField>
        </FormGridFullRow>
      </FormGrid>
      {addPumpError && (
        <p role="alert" className="ui-error-text">{addPumpError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <LoadingButton type="submit" isLoading={addPumpMutation.isPending} loadingLabel={t('addPump.adding')} className="ui-btn-primary">
          {t('addPump.submit')}
        </LoadingButton>
        <button type="button" onClick={onDone} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  )
}
