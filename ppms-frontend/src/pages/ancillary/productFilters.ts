import type { AncillaryProduct } from '../../api/ancillaryApi'

export type ProductFilter = 'all' | 'lowStock' | 'noPrice' | 'disabled'
export type ProductSort = 'name' | 'stockLowFirst' | 'newestFirst'

export const PRODUCT_FILTERS: ProductFilter[] = ['all', 'lowStock', 'noPrice', 'disabled']
export const PRODUCT_SORTS: ProductSort[] = ['name', 'stockLowFirst', 'newestFirst']

/** Brand, name and variant, without the pack size and unit the server adds to displayName. */
export function productTitle(product: AncillaryProduct): string {
  return [product.brand, product.name, product.variant]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
}

export function isOutOfStock(product: AncillaryProduct): boolean {
  return product.currentStockUnits <= 0
}

/** At or below the product's own threshold, or empty. */
export function isLowStock(product: AncillaryProduct): boolean {
  if (isOutOfStock(product)) return true
  return product.lowStockThreshold != null && product.currentStockUnits <= product.lowStockThreshold
}

/**
 * How full the stock bar is. With a low-stock mark the bar is full at twice that mark, so the mark sits halfway;
 * without one it is the share left of the open batches' delivered units, since a product has no set capacity.
 */
export function stockBarFillPercent(product: AncillaryProduct): number {
  const stock = Math.max(0, product.currentStockUnits)
  const threshold = product.lowStockThreshold
  const delivered = product.activeFifoLots.reduce((sum, lot) => sum + lot.originalQuantity, 0)
  const scale = threshold != null && threshold > 0 ? Math.max(threshold * 2, stock) : Math.max(delivered, stock)
  return scale > 0 ? (stock / scale) * 100 : 0
}

/** What the units on hand cost to buy, batch by batch; null when the buy price is unknown. */
export function stockValue(product: AncillaryProduct): number | null {
  if (product.activeFifoLots.length > 0) {
    return product.activeFifoLots.reduce((sum, lot) => sum + lot.remainingQuantity * lot.costPricePerUnit, 0)
  }
  return product.fifoCostPricePerUnit == null ? null : product.currentStockUnits * product.fifoCostPricePerUnit
}

const isActive = (product: AncillaryProduct) => product.status === 'ACTIVE'

/** Low stock and No price list only active products: a disabled product needs neither. */
function matchesFilter(product: AncillaryProduct, filter: ProductFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'lowStock': return isActive(product) && isLowStock(product)
    case 'noPrice': return isActive(product) && product.currentSellingPricePerUnit == null
    case 'disabled': return !isActive(product)
  }
}

function matchesSearch(product: AncillaryProduct, needle: string): boolean {
  return !needle || [product.displayName, product.name, product.brand, product.variant]
    .some((value) => value?.toLocaleLowerCase().includes(needle))
}

export function countByFilter(products: AncillaryProduct[]): Record<ProductFilter, number> {
  return Object.fromEntries(
    PRODUCT_FILTERS.map((filter) => [filter, products.filter((product) => matchesFilter(product, filter)).length]),
  ) as Record<ProductFilter, number>
}

export function filterProducts(products: AncillaryProduct[], filter: ProductFilter, search: string): AncillaryProduct[] {
  const needle = search.trim().toLocaleLowerCase()
  return products.filter((product) => matchesFilter(product, filter) && matchesSearch(product, needle))
}

const byTitle = (a: AncillaryProduct, b: AncillaryProduct) => productTitle(a).localeCompare(productTitle(b))

export function sortProducts(products: AncillaryProduct[], sort: ProductSort): AncillaryProduct[] {
  return products.toSorted((a, b) => {
    if (sort === 'stockLowFirst') return a.currentStockUnits - b.currentStockUnits || byTitle(a, b)
    if (sort === 'newestFirst') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id
    return byTitle(a, b)
  })
}
