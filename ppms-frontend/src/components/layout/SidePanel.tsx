import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from '../ModalPortal'
import { IconButton } from '../IconButton'
import type { ModalTone } from '../Modal'

export type SidePanelSize = 'md' | 'lg'

interface SidePanelProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Header stripe and icon, as on Modal; read-only views keep the default. */
  tone?: ModalTone
  size?: SidePanelSize
  onClose: () => void
  /** Buttons shown in the header next to Close, e.g. Print. */
  headerActions?: ReactNode
  /** Stays at the bottom while the body scrolls. */
  footer?: ReactNode
  returnFocusRef?: RefObject<HTMLElement | null>
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
  children: ReactNode
}

/**
 * A dialog that slides in from the right on wider screens and fills the screen on phones, for reading details
 * without leaving the page. Focus starts on the title, stays inside, Escape or the backdrop closes it and focus returns.
 * For a deep link, drive it from a search parameter with useUrlParam.
 */
export function SidePanel({
  title,
  subtitle,
  tone = 'info',
  size = 'md',
  onClose,
  headerActions,
  footer,
  returnFocusRef,
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  children,
}: SidePanelProps) {
  const { t } = useTranslation()
  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick returnFocusRef={returnFocusRef}>
      <div className="ui-side-panel-backdrop">
        <div className={`ui-side-panel ui-side-panel--${size}`}>
          <div className={`ui-modal-header ui-modal-header--themed ui-modal-header--${tone} ${headerClassName}`}>
            <div className="ui-modal-heading">
              <h2 tabIndex={-1} data-autofocus className="ui-modal-title outline-none">{title}</h2>
              {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
            </div>
            {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            <IconButton label={t('actions.close')} icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
          </div>
          <div className={`ui-modal-body ${bodyClassName}`}>{children}</div>
          {footer && <div className={`ui-modal-footer ${footerClassName}`}>{footer}</div>}
        </div>
      </div>
    </ModalPortal>
  )
}
