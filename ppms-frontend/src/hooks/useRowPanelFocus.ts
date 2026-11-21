import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'

/** Moves focus into an inline row panel when it opens and back to the row's menu button when it closes. */
export function useRowPanelFocus(
  openPanel: string | null,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  const previousPanel = useRef(openPanel)

  useEffect(() => {
    const wasOpen = previousPanel.current !== null
    previousPanel.current = openPanel
    if (openPanel !== null) {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else if (wasOpen) {
      const active = document.activeElement
      if (!active || active === document.body || !document.contains(active)) triggerRef.current?.focus()
    }
  }, [openPanel, panelRef, triggerRef])
}
