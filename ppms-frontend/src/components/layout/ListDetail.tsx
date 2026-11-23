import { useLayoutEffect, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DESKTOP_QUERY } from '../../constants/breakpoints'
import { useMediaQuery } from '../../hooks/useMediaQuery'

interface ListDetailProps {
  /** Names the list navigation, e.g. "Shifts". */
  listLabel: string
  /** Names the detail region, e.g. "Shift details". */
  detailLabel: string
  /** Links that put the item's id in the address; the open one carries aria-current="page". */
  list: ReactNode
  /** Id from the address; null means nothing is open. */
  selectedId: string | number | null
  detail: ReactNode
  /** Shown beside the list on desktop while nothing is open. */
  placeholder: ReactNode
  /** Leaves the detail screen below desktop width, normally by removing the id from the address. */
  onBack: () => void
}

function scrollContainer(element: HTMLElement | null): HTMLElement | null {
  return element?.closest('main') ?? (document.scrollingElement as HTMLElement | null)
}

/**
 * List beside detail from 1024px; below that, two screens. The list stays mounted while hidden,
 * so Back returns to the same filters, page and scroll position, with focus on the item that was opened.
 */
export function ListDetail({ listLabel, detailLabel, list, selectedId, detail, placeholder, onBack }: ListDetailProps) {
  const { t } = useTranslation()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const listRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const savedScrollTop = useRef<number | null>(null)
  const openedFrom = useRef<HTMLElement | null>(null)
  const hasSelection = selectedId !== null
  const hadSelection = useRef(hasSelection)

  const rememberPlace = (event: MouseEvent<HTMLElement>) => {
    if (isDesktop) return
    savedScrollTop.current = scrollContainer(listRef.current)?.scrollTop ?? null
    openedFrom.current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('a, button') : null
  }

  useLayoutEffect(() => {
    const changed = hadSelection.current !== hasSelection
    hadSelection.current = hasSelection
    if (isDesktop || !changed) return
    if (hasSelection) {
      detailRef.current?.focus()
      return
    }
    const container = scrollContainer(listRef.current)
    if (container && savedScrollTop.current !== null) container.scrollTop = savedScrollTop.current
    if (openedFrom.current && document.contains(openedFrom.current)) openedFrom.current.focus({ preventScroll: true })
  }, [hasSelection, isDesktop])

  const showList = isDesktop || !hasSelection
  const showDetail = isDesktop || hasSelection

  return (
    <div className={`ui-list-detail ${isDesktop ? 'ui-list-detail--split' : ''}`}>
      <nav ref={listRef} aria-label={listLabel} hidden={!showList} onClickCapture={rememberPlace} className="ui-list-detail__list">
        {list}
      </nav>
      {showDetail && (
        <section ref={detailRef} aria-label={detailLabel} tabIndex={-1} className="ui-list-detail__detail outline-none">
          {!isDesktop && (
            <button type="button" onClick={onBack} className="ui-btn ui-btn-ghost ui-list-detail__back">
              <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              {t('layout.backToList')}
            </button>
          )}
          {hasSelection ? detail : placeholder}
        </section>
      )}
    </div>
  )
}
