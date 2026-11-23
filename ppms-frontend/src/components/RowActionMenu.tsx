import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { IconButton } from './IconButton'

export interface RowActionMenuItem {
  key: string
  label: string
  description: string
  icon: ReactNode
  className: string
  onSelect: () => void
  disabled?: boolean
}

interface RowActionMenuProps {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  items: RowActionMenuItem[]
  triggerClassName: string
  menuClassName: string
  triggerRef?: RefObject<HTMLButtonElement | null>
}

/** Menu button (WAI-ARIA APG): arrow keys move between items, Escape closes and returns focus to the button. */
export function RowActionMenu({ label, open, onOpenChange, items, triggerClassName, menuClassName, triggerRef }: RowActionMenuProps) {
  const menuId = useId()
  const ownTriggerRef = useRef<HTMLButtonElement>(null)
  const buttonRef = triggerRef ?? ownTriggerRef
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', closeOnOutsidePress)
    return () => document.removeEventListener('mousedown', closeOnOutsidePress)
  }, [open, onOpenChange])

  const moveFocus = (step: number | 'first' | 'last') => {
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (menuItems.length === 0) return
    const current = menuItems.indexOf(document.activeElement as HTMLElement)
    const next = step === 'first' ? 0
      : step === 'last' ? menuItems.length - 1
      : (current + step + menuItems.length) % menuItems.length
    menuItems[next].focus()
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); moveFocus(1); break
      case 'ArrowUp':   event.preventDefault(); moveFocus(-1); break
      case 'Home':      event.preventDefault(); moveFocus('first'); break
      case 'End':       event.preventDefault(); moveFocus('last'); break
      case 'Escape':
        event.preventDefault()
        onOpenChange(false)
        buttonRef.current?.focus()
        break
      case 'Tab':
        onOpenChange(false)
        break
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        ref={buttonRef}
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={triggerClassName}
        label={label}
        icon="⋮"
      />
      {open && (
        <div id={menuId} ref={menuRef} role="menu" aria-label={label} tabIndex={-1} className={menuClassName} onKeyDown={handleMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => { onOpenChange(false); item.onSelect() }}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${item.className}`}
            >
              <span aria-hidden="true" className="mt-0.5 shrink-0 leading-none">{item.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-5">{item.label}</span>
                <span className="block text-xs text-ink-2">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
