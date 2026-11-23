import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { isValidHsnCode } from '../../utils/gst'

export function EditHsnDialog({
  pumpId, product, onClose, onSuccess,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const { addToast } = useToastStore()
  const [hsnCode, setHsnCode] = useState(product.hsnCode ?? '')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => ancillaryApi.updateProduct(pumpId, product.id, { hsnCode: hsnCode.trim() }),
    onSuccess: () => {
      addToast(t('editHsn.saved'), 'success')
      onSuccess()
    },
    onError: (err) => setServerError(parseApiError(err, t('editHsn.saveFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!isValidHsnCode(hsnCode)) { setFieldError(t('validation.hsnInvalid')); return }
    setFieldError(null)
    mutation.mutate()
  }

  return (
    <Modal
      tone="info"
      title={t('editHsn.title')}
      subtitle={product.displayName}
      size="sm"
      onClose={onClose}
      canClose={!mutation.isPending}
      closeOnBackdropClick
      onSubmit={handleSubmit}
      bodyClassName="space-y-3"
      footer={<>
        <button type="button" onClick={onClose} disabled={mutation.isPending} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
        <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
          {t('common:actions.save')}
        </LoadingButton>
      </>}
    >
      <FormField label={t('fields.hsnCode')} error={fieldError ?? undefined} help={t('editHsn.help')}>
        <input
          inputMode="numeric"
          maxLength={8}
          value={hsnCode}
          onChange={e => setHsnCode(e.target.value.replace(/\D/g, ''))}
          data-autofocus
        />
      </FormField>
      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
