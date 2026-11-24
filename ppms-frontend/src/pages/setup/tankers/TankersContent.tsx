import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { tankerApi } from '../../../api/tankerApi'
import type { Tanker, CreateTankerRequest } from '../../../api/tankerApi'
import { useToastStore } from '../../../store/toastStore'
import { TankerForm } from './TankerForm'
import type { TankerFieldErrors } from './TankerForm'
import { LoadingButton } from '../../../components/LoadingButton'
import { SkeletonRows } from '../../../components/Skeleton'
import { TankerCard } from './TankerCard'

export function TankersContent({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['setup', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const { data: tankers = [], isLoading } = useQuery<Tanker[]>({
    queryKey: ['tankers', pumpId],
    queryFn: () => tankerApi.getTankers(pumpId),
  })

  const [showAdd,    setShowAdd]    = useState(false)
  const [editId,     setEditId]     = useState<number | null>(null)
  const [name,       setName]       = useState('')
  const [capacity,   setCapacity]   = useState('')
  const [tankerType, setTankerType] = useState<'OWN' | 'COMPANY'>('COMPANY')
  const [makeDefault, setMakeDefault] = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<TankerFieldErrors>({})

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tankers', pumpId] })

  const resetForm = () => {
    setName(''); setCapacity(''); setTankerType('COMPANY'); setMakeDefault(false)
    setFormError(null); setFieldErrors({}); setShowAdd(false); setEditId(null)
  }

  const startEdit = (tanker: Tanker) => {
    setEditId(tanker.id); setName(tanker.name)
    setCapacity(String(tanker.capacityLitres)); setTankerType(tanker.tankerType)
    setMakeDefault(tanker.defaultTanker); setFormError(null); setFieldErrors({}); setShowAdd(false)
  }

  const createMutation = useMutation({
    mutationFn: (req: CreateTankerRequest) => tankerApi.createTanker(pumpId, req),
    onSuccess: () => { invalidate(); resetForm(); addToast(t('tankers.added'), 'success') },
    onError: (err: unknown) => setFormError(parseApiError(err, t('tankers.addFailed'))),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: number; req: CreateTankerRequest }) =>
      tankerApi.updateTanker(pumpId, id, req),
    onSuccess: () => { invalidate(); resetForm(); addToast(t('tankers.updated'), 'success') },
    onError: (err: unknown) => setFormError(parseApiError(err, t('tankers.updateFailed'))),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => tankerApi.deactivateTanker(pumpId, id),
    onSuccess: () => { invalidate(); addToast(t('tankers.removed'), 'success') },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => tankerApi.setDefault(pumpId, id),
    onSuccess: () => { invalidate(); addToast(t('tankers.defaultUpdated'), 'success') },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cap = parseFloat(capacity)
    const errors: TankerFieldErrors = {
      name: name.trim() ? undefined : t('tankers.nameRequired'),
      capacity: !capacity || isNaN(cap) || cap < 100 ? t('tankers.capacityMin') : undefined,
    }
    setFieldErrors(errors)
    if (errors.name || errors.capacity) return
    setFormError(null)
    const req: CreateTankerRequest = {
      name: name.trim(), capacityLitres: cap, tankerType, defaultTanker: makeDefault,
    }
    if (editId !== null) {
      updateMutation.mutate({ id: editId, req })
    } else {
      createMutation.mutate(req)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  const formFields = (
    <TankerForm
      name={name} setName={setName}
      capacity={capacity} setCapacity={setCapacity}
      tankerType={tankerType} setTankerType={setTankerType}
      makeDefault={makeDefault} setMakeDefault={setMakeDefault}
      fieldErrors={fieldErrors}
      error={formError}
    />
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">{t('tankers.intro')}</p>

      {isLoading ? (
        <SkeletonRows count={3} />
      ) : tankers.length === 0 && !showAdd ? (
        <div className="flex items-start gap-3 rounded-card border border-dashed border-border bg-surface p-4">
          <span aria-hidden="true" className="ui-hub-card__icon"><Truck size={18} strokeWidth={2} /></span>
          <p className="text-sm text-ink-2">{t('tankers.empty')}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tankers.map(tanker => editId === tanker.id ? (
            <li key={tanker.id} className="col-span-full">
              <form onSubmit={handleSubmit} noValidate aria-label={t('tankers.edit')} className="ui-inline-form space-y-3">
                <h3 className="ui-inline-form__title">{t('tankers.editTitle', { name: tanker.name })}</h3>
                {formFields}
                <div className="flex flex-wrap gap-2">
                  <LoadingButton type="submit" isLoading={isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
                    {t('tankers.save')}
                  </LoadingButton>
                  <button type="button" onClick={resetForm} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
                </div>
              </form>
            </li>
          ) : (
            <li key={tanker.id}>
              <TankerCard
                tanker={tanker}
                actionsDisabled={setDefaultMutation.isPending || deactivateMutation.isPending}
                onEdit={() => startEdit(tanker)}
                onMakeDefault={() => setDefaultMutation.mutate(tanker.id)}
                onRemove={() => deactivateMutation.mutate(tanker.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {showAdd ? (
        <form onSubmit={handleSubmit} noValidate aria-labelledby="new-tanker-title" className="ui-inline-form space-y-3">
          <h3 id="new-tanker-title" className="ui-inline-form__title">{t('tankers.newTanker')}</h3>
          {formFields}
          <div className="flex flex-wrap gap-2">
            <LoadingButton type="submit" isLoading={isPending} loadingLabel={t('actions.adding')} className="ui-btn-primary">
              {t('tankers.add')}
            </LoadingButton>
            <button type="button" onClick={resetForm} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
          </div>
        </form>
      ) : editId === null && (
        <button type="button" onClick={() => { resetForm(); setShowAdd(true) }} className="ui-btn ui-btn-secondary gap-1.5">
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          {t('tankers.add')}
        </button>
      )}
    </div>
  )
}
