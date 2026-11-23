import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { superAdminApi } from '../../api/superAdminApi'
import type { OnboardOwnerResponse } from '../../api/superAdminApi'
import { PasswordInput } from '../../components/PasswordInput'
import { NumericInput } from '../../components/NumericInput'
import { LoadingButton } from '../../components/LoadingButton'
import { FormField } from '../../components/FormField'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { StickyActions } from '../../components/layout/StickyActions'
import { parseApiError } from '../../utils/apiError'
import { onboardSchema } from './superAdminSchemas'
import type { OnboardFormData, OnboardFormInput } from './superAdminSchemas'

interface OnboardOwnerPageProps {
  /** Where Cancel and the back link return to. */
  ownersPath: string
  onSubmitStart: () => void
  onCreated: (owner: OnboardOwnerResponse, password: string) => void
}

/** Creating an owner account and their first pump, as a page of its own. */
export function OnboardOwnerPage({ ownersPath, onSubmitStart, onCreated }: OnboardOwnerPageProps) {
  const { t } = useTranslation(['superadmin', 'auth', 'common'])
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const schema = useMemo(() => onboardSchema(t), [t])
  const { register, handleSubmit, formState: { errors } } = useForm<OnboardFormInput, unknown, OnboardFormData>({
    resolver: zodResolver(schema),
  })

  const onboardMutation = useMutation({
    mutationFn: superAdminApi.onboardOwner,
    onSuccess: (data, variables) => {
      setServerError(null)
      queryClient.invalidateQueries({ queryKey: ['superadmin-owners'] })
      queryClient.invalidateQueries({ queryKey: ['superadmin-analytics'] })
      onCreated(data, variables.password)
    },
    onError: (err) => {
      setServerError(parseApiError(err, t('onboard.failed')))
    },
  })

  const onSubmit = (data: OnboardFormData) => {
    setServerError(null)
    onSubmitStart()
    onboardMutation.mutate(data)
  }

  return (
    <>
      <PageHeader
        title={t('onboard.title')}
        description={t('onboard.subtitle')}
        backLink={{ to: ownersPath, label: t('onboard.backToOwners') }}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-(--density-gap)">
        <PageSection title={t('onboard.ownerDetails')}>
          <FormGrid>
            <FormField label={t('onboard.fullName')} error={errors.fullName?.message}>
              <input
                {...register('fullName')}
                type="text"
                autoComplete="off"
                className="text-sm"
              />
            </FormField>

            <FormField label={t('onboard.phoneNumber')} error={errors.phoneNumber?.message} help={t('onboard.phoneHelp')}>
              <input
                {...register('phoneNumber')}
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                className="text-sm"
              />
            </FormField>

            <FormField label={t('onboard.initialPassword')} error={errors.password?.message} help={t('auth:passwordPolicy')}>
              <PasswordInput
                {...register('password')}
                autoComplete="new-password"
                className="text-sm"
              />
            </FormField>
          </FormGrid>
        </PageSection>

        <PageSection title={t('onboard.pumpDetails')}>
          <FormGrid>
            <FormField label={t('fields.pumpName')} error={errors.pumpName?.message}>
              <input
                {...register('pumpName')}
                type="text"
                className="text-sm"
              />
            </FormField>

            <FormField label={t('fields.maxDuCount')} error={errors.maxDuCount?.message} help={t('fields.maxDuHelp')}>
              <NumericInput {...register('maxDuCount')} inputMode="numeric" min={1} max={20} step={1} />
            </FormField>

            <FormGridFullRow>
              <FormField label={t('fields.pumpAddress')} error={errors.pumpAddress?.message}>
                <input
                  {...register('pumpAddress')}
                  type="text"
                  className="text-sm"
                />
              </FormField>
            </FormGridFullRow>
          </FormGrid>
        </PageSection>

        {serverError && (
          <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>
        )}

        <StickyActions>
          <Link to={ownersPath} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</Link>
          <LoadingButton type="submit" isLoading={onboardMutation.isPending} loadingLabel={t('onboard.creating')} className="ui-btn-primary">
            {t('onboard.submit')}
          </LoadingButton>
        </StickyActions>
      </form>
    </>
  )
}
