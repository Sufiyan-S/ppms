import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Modal } from '../../components/Modal'
import { SearchableSelect } from '../../components/SearchableSelect'
import { StillNeeded } from '../../components/StillNeeded'

/** First step of a sale started without a product, e.g. from the command palette: choose what is being sold. */
export function SellProductPicker({
  products, onPick, onClose,
}: {
  products: AncillaryProduct[]
  onPick: (product: AncillaryProduct) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const stillNeededId = useId()
  const sellable = products.filter(p => p.status === 'ACTIVE' && p.currentStockUnits > 0)
  const [productId, setProductId] = useState('')
  const chosen = sellable.find(p => p.id.toString() === productId)
  const stillNeeded = chosen || sellable.length === 0 ? [] : [t('stockIn.needProduct')]

  return (
    <Modal
      tone="info"
      title={t('sell.title')}
      subtitle={t('sellPicker.subtitle')}
      onClose={onClose}
      confirmDiscard={false}
      bodyClassName="space-y-3"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <button type="button" onClick={() => chosen && onPick(chosen)} disabled={!chosen}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn ui-btn-primary">
          {t('sellPicker.continue')}
        </button>
      </>}
    >
      {sellable.length === 0 ? (
        <p className="ui-empty">{t('sellPicker.noneInStock')}</p>
      ) : (
        <div>
          <span className="ui-label">{t('fields.product')}</span>
          <SearchableSelect
            label={t('fields.product')}
            value={productId}
            onChange={setProductId}
            placeholder={t('fields.selectProduct')}
            options={sellable.map(p => ({
              value: p.id.toString(),
              label: t(p.currentSellingPricePerUnit == null ? 'fields.productOptionNoPrice' : 'fields.productOption',
                { name: p.displayName, stock: p.currentStockUnits }),
            }))}
          />
        </div>
      )}
    </Modal>
  )
}
