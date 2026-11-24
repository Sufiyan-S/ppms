import { useRef } from 'react'
import type { FormEventHandler, ReactNode, Ref, RefObject } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsPhone } from '../hooks/useIsPhone'
import { ModalPortal } from './ModalPortal'
import { IconButton } from './IconButton'
import { ModalToneIcon } from './ModalToneIcon'
import { ModalDiscardConfirm } from './ModalDiscardConfirm'
import { useExitAnimation } from './useExitAnimation'
import { useDiscardGuard } from './useDiscardGuard'
import { useScrollEdges } from './useScrollEdges'
import { useSheetSwipe } from './useSheetSwipe'

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
  /** Header icon, chosen by purpose: info enters data, success completes, warning cautions, danger destroys; neutral has none. */
  tone: ModalTone
  size?: ModalSize
  onClose: () => void
  /** False while the modal must stay open (e.g. a save is in flight): Escape, backdrop, swipe and the Close button do nothing. */
  canClose?: boolean
  closeOnBackdropClick?: boolean
  /**
   * After the user has typed or changed anything, closing from Close, Escape, the backdrop or a swipe first asks
   * "Discard your changes?". Turn off where the inputs are only search or filter boxes, or the form guards itself.
   */
  confirmDiscard?: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Below the phone breakpoint the panel fills the whole screen instead of rising as a bottom sheet. */
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
  confirmDiscard = true,
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
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const isSheet = useIsPhone() && !fullScreenOnPhone
  const backdropVariant = fullScreenOnPhone ? 'ui-modal-backdrop--fullscreen' : isSheet ? 'ui-modal-backdrop--sheet' : ''
  const { isClosing, close } = useExitAnimation(panelRef, onClose)
  const { isConfirming, requestClose, keepEditing, discard } = useDiscardGuard(panelRef, confirmDiscard, close)
  useScrollEdges(panelRef, bodyRef)
  useSheetSwipe(panelRef, isSheet && canClose, requestClose)

  const content = (
    <>
      <div ref={bodyRef} className={`ui-modal-body ${bodyClassName}`}>{children}</div>
      {isConfirming
        ? <ModalDiscardConfirm onKeepEditing={keepEditing} onDiscard={discard} />
        : footer && <div className={`ui-modal-footer ${footerClassName}`}>{footer}</div>}
    </>
  )

  return (
    <ModalPortal
      onClose={canClose && !isClosing ? requestClose : undefined}
      closeOnBackdropClick={closeOnBackdropClick}
      returnFocusRef={returnFocusRef}
    >
      <div className={`ui-modal-backdrop ${backdropVariant}`} data-closing={isClosing || undefined}>
        <div ref={panelRef} className={`ui-modal-panel ${SIZE_CLASS[size]}`}>
          {isSheet && (
            <div className="ui-modal-grab" data-sheet-drag>
              <span className="sr-only">{t('modal.dragToClose')}</span>
            </div>
          )}
          <div
            className={`ui-modal-header ui-modal-header--themed ui-modal-header--${tone} ${headerClassName}`}
            data-sheet-drag={isSheet || undefined}
          >
            <ModalToneIcon tone={tone} />
            <div className="ui-modal-heading">
              <h2 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="ui-modal-title outline-none">{title}</h2>
              {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
              {headerExtra}
            </div>
            {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            <IconButton
              label={t('actions.close')}
              icon={<X size={20} />}
              onClick={requestClose}
              disabled={!canClose}
              className="ui-btn ui-btn-ghost ui-modal-close"
            />
          </div>
          {onSubmit ? (
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</form>
          ) : content}
        </div>
      </div>
    </ModalPortal>
  )
}
