import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Renders modal content directly into document.body, escaping any ancestor
 * CSS stacking contexts (e.g. the animated ui-route-fade wrapper). This
 * ensures modals always paint above the dashboard header regardless of the
 * page's own z-index hierarchy.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
