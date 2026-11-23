import { useTranslation } from 'react-i18next'
import { codeLabel } from '../../constants/labels'
import type { TankerDelivery } from '../../api/inventoryApi'
import { Modal } from '../../components/Modal'
import { LoadingButton } from '../../components/LoadingButton'
import { LitresText } from '../../components/AmountText'
import { LiveFigures } from '../../components/LiveFigures'
import { fmtDate } from './inventoryFormat'

export function DeleteInvoiceModal({ invoice, rows, isPending, error, onConfirm, onClose }: {
  invoice: string
  rows: TankerDelivery[]
  isPending: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const totalQty = rows.reduce((s, r) => s + r.quantityDelivered, 0)
  return (
    <Modal
      title={t('deleteInvoice.title')}
      subtitle={t('deleteInvoice.subtitle', { invoice, date: fmtDate(rows[0].deliveryDate) })}
      tone="danger"
      onClose={onClose}
      canClose={!isPending}
      bodyClassName="space-y-4"
      footer={<>
        <button type="button" onClick={onClose} disabled={isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" onClick={onConfirm} isLoading={isPending} loadingLabel={t('deleteInvoice.deleting')}
          className="ui-btn-danger">
          {t('deleteInvoice.confirm')}
        </LoadingButton>
      </>}
    >
      <p className="text-sm text-ink-2">{t('deleteInvoice.warning')}</p>

      <LiveFigures
        label={t('deleteInvoice.linesLabel')}
        figures={[
          ...rows.map(r => ({
            label: `${r.tankIdentifier} · ${codeLabel(r.fuelType)}`,
            value: <LitresText value={-r.quantityDelivered} showSign />,
          })),
          { label: t('deleteInvoice.totalRemoved'), value: <LitresText value={totalQty} />, isResult: true },
        ]}
      />

      {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
    </Modal>
  )
}
