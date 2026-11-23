import type { FormEventHandler, ReactNode, Ref, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalPortal } from './ModalPortal'
import { IconButton } from './IconButton'

export type ModalTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'
export type ModalSize = 'sm' | 'md' | 'md-wide' | 'lg' | 'full'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  'md-wide': 'w-full max-w-140',
  lg: '',
  full: 'ui-modal-panel--lg',
}

interface ModalProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Header stripe and icon, chosen by purpose: info enters data, success completes, warning cautions, danger destroys. */
  tone: ModalTone
  size?: ModalSize
  onClose: () => void
  /** False while the modal must stay open (e.g. a save is in flight): Escape, backdrop and the Close button do nothing. */
  canClose?: boolean
  closeOnBackdropClick?: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Below the phone breakpoint the panel fills the whole screen. */
  fullScreenOnPhone?: boolean
  /** Extra content inside the header, under the subtitle. */
  headerExtra?: ReactNode
  /** Buttons shown in the header next to Close. */
  headerActions?: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
  /** Wraps the body and footer in a form so Enter submits and the footer's submit button works. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  footer?: ReactNode
  bodyClassName?: string
  footerClassName?: string
  headerClassName?: string
  children: ReactNode
}

/** A dialog with the shared header, scrolling body and sticky footer, on top of ModalPortal's focus handling. */
export function Modal({
  title,
  subtitle,
  tone,
  size = 'md',
  onClose,
  canClose = true,
  closeOnBackdropClick = false,
  returnFocusRef,
  fullScreenOnPhone = false,
  headerExtra,
  headerActions,
  titleRef,
  onSubmit,
  footer,
  bodyClassName = '',
  footerClassName = '',
  headerClassName = '',
  children,
}: ModalProps) {
  const { t } = useTranslation()
  const toneClass = `ui-modal-header--themed ui-modal-header--${tone}`
  const content = (
    <>
      <div className={`ui-modal-body ${bodyClassName}`}>{children}</div>
      {footer && <div className={`ui-modal-footer ${footerClassName}`}>{footer}</div>}
    </>
  )

  return (
    <ModalPortal onClose={canClose ? onClose : undefined} closeOnBackdropClick={closeOnBackdropClick} returnFocusRef={returnFocusRef}>
      <div className={`ui-modal-backdrop ${fullScreenOnPhone ? 'ui-modal-backdrop--fullscreen' : ''}`}>
        <div className={`ui-modal-panel ${SIZE_CLASS[size]}`}>
          <div className={`ui-modal-header ${toneClass} ${headerClassName}`}>
            <div className="ui-modal-heading">
              <h2 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="ui-modal-title outline-none">{title}</h2>
              {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
              {headerExtra}
            </div>
            {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            <IconButton label={t('actions.close')} icon="×" onClick={onClose} disabled={!canClose} className="ui-btn ui-btn-ghost ui-modal-close" />
          </div>
          {onSubmit ? (
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</form>
          ) : content}
        </div>
      </div>
    </ModalPortal>
  )
}
