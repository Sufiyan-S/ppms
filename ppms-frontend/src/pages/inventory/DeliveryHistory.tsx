import { useState } from 'react'
import { codeLabel } from '../../constants/labels'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Trash2, Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDecimal } from '../../utils/format'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, TankerDelivery } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { LoadError } from '../../components/LoadError'
import { parseApiError } from '../../utils/apiError'
import { IconButton } from '../../components/IconButton'
import { LitresText, MoneyText } from '../../components/AmountText'
import { FilterBar } from '../../components/layout/FilterBar'
import { PageSection } from '../../components/layout/PageSection'
import { DeleteInvoiceModal } from './DeleteInvoiceModal'
import { InvoiceDetailsPanel } from './InvoiceDetailsPanel'
import { fmtDate } from './inventoryFormat'

interface Props {
  pumpId: number
  tanks: TankStock[]
  isOwnerOrAdmin: boolean
  canDeleteInvoice: boolean
}

const NO_INVOICE_KEY = 'No Invoice'

export function DeliveryHistory({ pumpId, tanks, isOwnerOrAdmin, canDeleteInvoice }: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const queryClient = useQueryClient()
  const [deliveryPage,      setDeliveryPage]      = useState(0)
  const [deliveryPageSize,  setDeliveryPageSize]  = useState(10)
  const [deliveryTankFilter, setDeliveryTankFilter] = useState('')
  const [deliveryFuelFilter, setDeliveryFuelFilter] = useState('')
  const [openInvoice,       setOpenInvoice]       = useState<string | null>(null)
  const [deleteInvoice,     setDeleteInvoice]     = useState<{ invoice: string; rows: TankerDelivery[] } | null>(null)

  const deleteLatestMutation = useMutation({
    mutationFn: (invoiceReference: string) => inventoryApi.deleteLatestDelivery(pumpId, invoiceReference),
    onSuccess: () => {
      setDeleteInvoice(null)
      queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] }),
  })

  const { data: deliveriesPage, isLoading: deliveriesLoading, isLoadingError: deliveriesLoadFailed, refetch: refetchDeliveries } = useQuery({
    queryKey: ['deliveries', pumpId, deliveryPage, deliveryPageSize],
    queryFn:  () => inventoryApi.getDeliveries(pumpId, deliveryPage, deliveryPageSize),
  })
  const deliveries = deliveriesPage?.content ?? []

  // Only the most recently entered invoice can be deleted; it may be back-dated, so it is not always the top group.
  const { data: latestInvoiceLines = [] } = useQuery({
    queryKey: ['deliveries', pumpId, 'latest'],
    queryFn:  () => inventoryApi.getLatestInvoiceLines(pumpId),
    enabled:  canDeleteInvoice,
  })
  const latestInvoice = latestInvoiceLines[0]?.invoiceReference ?? null

  const filtered = deliveries.filter(d =>
    (!deliveryTankFilter || d.tankIdentifier === deliveryTankFilter) &&
    (!deliveryFuelFilter || d.fuelType === deliveryFuelFilter)
  )
  const groups = Object.entries(
    filtered.reduce<Record<string, TankerDelivery[]>>((acc, d) => {
      const key = d.invoiceReference || NO_INVOICE_KEY
      ;(acc[key] ??= []).push(d)
      return acc
    }, {})
  ).sort(([, a], [, b]) => b[0].deliveryDate.localeCompare(a[0].deliveryDate))
  const openRows = groups.find(([invoice]) => invoice === openInvoice)?.[1]
  const invoiceLabel = (invoice: string) => invoice === NO_INVOICE_KEY ? t('deliveries.noInvoice') : invoice
  const hasActiveFilters = Boolean(deliveryTankFilter || deliveryFuelFilter)

  return (
    <PageSection title={t('deliveries.historyTitle')} flush>
      <FilterBar
        label={t('deliveries.filterTitle')}
        onClearFilters={() => { setDeliveryTankFilter(''); setDeliveryFuelFilter('') }}
        hasActiveFilters={hasActiveFilters}
      >
        <div className="w-44">
          <SearchableSelect label={t('deliveries.filterByTank')}
            value={deliveryTankFilter}
            onChange={v => setDeliveryTankFilter(v)}
            options={[
              { value: '', label: t('filters.allTanks') },
              ...tanks.map(tank => ({ value: tank.tankIdentifier, label: tank.tankIdentifier })),
            ]}
            placeholder={t('filters.byTank')}
          />
        </div>
        <div className="w-44">
          <SearchableSelect label={t('deliveries.filterByFuel')}
            value={deliveryFuelFilter}
            onChange={v => setDeliveryFuelFilter(v)}
            options={[
              { value: '', label: t('filters.allFuelTypes') },
              ...Array.from(new Set(tanks.map(tank => tank.fuelType))).map(ft => ({ value: ft, label: codeLabel(ft) })),
            ]}
            placeholder={t('filters.byFuelType')}
          />
        </div>
      </FilterBar>

      {deliveriesLoading ? (
        <div className="p-(--density-card-pad)"><SkeletonRows count={3} /></div>
      ) : deliveriesLoadFailed ? (
        <LoadError onRetry={() => void refetchDeliveries()} className="m-4" />
      ) : groups.length === 0 ? (
        <p className="p-(--density-card-pad) text-sm text-ink-3">
          {deliveries.length === 0 ? t('deliveries.empty') : t('deliveries.noMatch')}
        </p>
      ) : (
        <>
          <ul>
            {groups.map(([invoice, rows]) => {
              const totalQty = rows.reduce((s, r) => s + r.quantityDelivered, 0)
              const totalCost = rows.reduce((s, r) => s + r.totalCost, 0)
              const isLatestEnteredInvoice = latestInvoice !== null && invoice === latestInvoice
              return (
                <li key={invoice} className="flex items-center gap-1 border-b border-border pr-2">
                  <button
                    type="button"
                    onClick={() => setOpenInvoice(invoice)}
                    aria-haspopup="dialog"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-(--density-card-pad) py-(--density-row-y) text-left transition-colors hover:bg-bg"
                  >
                    <span className="text-xs text-ink-3">{t('deliveries.billNo')}</span>
                    <span className="font-mono text-xs font-semibold text-info bg-info-bg border border-border px-2.5 py-1 rounded-control">
                      {invoiceLabel(invoice)}
                    </span>
                    <span className="text-xs text-ink-3">{fmtDate(rows[0].deliveryDate)}</span>
                    <span className="text-xs text-ink-3">·</span>
                    <span className="text-xs text-ink-3">{t('deliveries.tankCount', { count: rows.length })}</span>
                    {rows[0].tankerName && (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-2 bg-surface-sunken border border-border px-2 py-0.5 rounded-badge">
                        <Truck size={10} strokeWidth={2} aria-hidden="true" />
                        {rows[0].tankerName}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      <LitresText value={totalQty} className="text-xs text-ink-3" />
                      {isOwnerOrAdmin && (rows[0].billTotal != null ? (
                        <span className="flex flex-col items-end leading-tight">
                          <MoneyText value={Number(rows[0].billTotal)} className="text-sm font-bold text-ink" />
                          {Math.abs(Number(rows[0].billTotal) - totalCost) > 0.005 && (
                            <span className="text-xs text-ink-3">
                              {t('deliveries.calculated', { amount: formatDecimal(totalCost) })}
                            </span>
                          )}
                        </span>
                      ) : (
                        <MoneyText value={totalCost} className="text-sm font-bold text-ink" />
                      ))}
                      <ChevronRight size={14} strokeWidth={2} aria-hidden="true" className="text-ink-3" />
                    </span>
                  </button>
                  {isLatestEnteredInvoice && canDeleteInvoice && (
                    <IconButton
                      onClick={() => setDeleteInvoice({ invoice, rows: latestInvoiceLines })}
                      className="shrink-0 text-ink-3 hover:text-bad transition-colors rounded-control"
                      label={t('deliveries.deleteInvoice')}
                      icon={<Trash2 size={14} />}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          {deliveriesPage && (
            <div className="px-(--density-card-pad)">
              <Pagination
                data={deliveriesPage}
                onPageChange={p => setDeliveryPage(p)}
                onPageSizeChange={s => { setDeliveryPageSize(s); setDeliveryPage(0) }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </>
      )}

      {openInvoice !== null && openRows && (
        <InvoiceDetailsPanel
          invoiceLabel={invoiceLabel(openInvoice)}
          rows={openRows}
          pumpId={pumpId}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onClose={() => setOpenInvoice(null)}
        />
      )}
      {deleteInvoice && (
        <DeleteInvoiceModal
          invoice={deleteInvoice.invoice}
          rows={deleteInvoice.rows}
          isPending={deleteLatestMutation.isPending}
          error={deleteLatestMutation.error ? parseApiError(deleteLatestMutation.error, t('deliveries.deleteFailed')) : null}
          onConfirm={() => deleteLatestMutation.mutate(deleteInvoice.invoice)}
          onClose={() => { setDeleteInvoice(null); deleteLatestMutation.reset() }}
        />
      )}
    </PageSection>
  )
}
