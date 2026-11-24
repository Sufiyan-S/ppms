import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Marks the panel with `data-scrolled` once its body has scrolled away from the top and `data-more-below`
 * while content is hidden under the footer, so CSS can show the header and footer edges only when they help.
 */
export function useScrollEdges(panelRef: RefObject<HTMLElement | null>, bodyRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = panelRef.current
    const body = bodyRef.current
    if (!panel || !body) return
    const update = () => {
      panel.toggleAttribute('data-scrolled', body.scrollTop > 0)
      panel.toggleAttribute('data-more-below', body.scrollTop + body.clientHeight < body.scrollHeight - 1)
    }
    update()
    body.addEventListener('scroll', update, { passive: true })

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    const observeSizes = () => {
      resizeObserver?.observe(body)
      Array.from(body.children).forEach((child) => resizeObserver?.observe(child))
    }
    observeSizes()
    const mutationObserver = new MutationObserver(() => {
      observeSizes()
      update()
    })
    mutationObserver.observe(body, { childList: true })

    return () => {
      body.removeEventListener('scroll', update)
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
    }
  }, [panelRef, bodyRef])
}
