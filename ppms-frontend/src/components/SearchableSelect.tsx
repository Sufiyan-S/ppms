import { useState, useRef, useEffect, useId } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
}

interface BaseProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown when value is empty */
  placeholder?: string
  /** Show search box when option count exceeds this threshold (default 5) */
  searchThreshold?: number
  accentColor?: 'blue' | 'orange'
  /** 'sm' for compact table rows, 'md' (default) for normal form fields */
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

type SearchableSelectProps = BaseProps & (
  | { label: string; 'aria-labelledby'?: never }
  | { 'aria-labelledby': string; label?: never }
)

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchThreshold = 5,
  accentColor = 'blue',
  size = 'md',
  disabled = false,
  className = '',
  label,
  'aria-labelledby': ariaLabelledby,
}: SearchableSelectProps) {
  const [open, setOpen]       = useState(false)
  const [search, setSearch]   = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(document.body)

  const baseId      = useId()
  const listboxId   = `${baseId}-listbox`
  const valueId     = `${baseId}-value`
  const optionId    = (index: number) => `${baseId}-option-${index}`

  const triggerRef  = useRef<HTMLButtonElement>(null)
  const dropRef     = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)
  const listboxRef  = useRef<HTMLDivElement>(null)

  const selected     = options.find(o => o.value === value)
  const showSearch   = options.length > searchThreshold
  const filtered     = showSearch
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const ringClass  = accentColor === 'orange' ? 'ring-orange-400 border-orange-400' : 'ring-blue-500 border-blue-500'
  const accentText = accentColor === 'orange' ? 'text-orange-600' : 'text-blue-600'
  const accentBg   = accentColor === 'orange' ? 'bg-orange-50' : 'bg-blue-50'
  const isCompact  = size === 'sm'

  // ── Position the dropdown using fixed coords so it escapes modal overflow ──
  function openDropdown() {
    if (!triggerRef.current) return
    const rect        = triggerRef.current.getBoundingClientRect()
    const dropMaxH    = 240
    const spaceBelow  = window.innerHeight - rect.bottom - 8
    const openUpward  = spaceBelow < dropMaxH && rect.top > dropMaxH

    setDropStyle(
      openUpward
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 9999 }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }
    )
    // Inside a modal the list must live in the dialog, otherwise aria-modal hides it from screen readers.
    setPortalTarget(triggerRef.current.closest<HTMLElement>('[role="dialog"]') ?? document.body)
    const selectedIndex = options.findIndex(o => o.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  function closeDropdown(returnFocus: boolean) {
    setOpen(false)
    setSearch('')
    if (returnFocus) triggerRef.current?.focus()
  }

  function selectOption(option: SelectOption) {
    onChange(option.value)
    closeDropdown(true)
  }

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => (showSearch ? searchRef.current : listboxRef.current)?.focus())
  }, [open, showSearch])

  useEffect(() => {
    if (!open) return
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' })
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      openDropdown()
    }
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLElement>) {
    const lastIndex = filtered.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, lastIndex))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(Math.max(lastIndex, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[activeIndex]) selectOption(filtered[activeIndex])
        break
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        closeDropdown(true)
        break
    }
  }

  const activeDescendant = open && filtered[activeIndex] ? optionId(activeIndex) : undefined

  return (
    <div className={`relative ${className}`}>
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label ? `${label}: ${selected ? selected.label : placeholder}` : undefined}
        aria-labelledby={ariaLabelledby ? `${ariaLabelledby} ${valueId}` : undefined}
        onClick={() => open ? closeDropdown(false) : openDropdown()}
        onKeyDown={handleTriggerKeyDown}
        className={[
          'ui-select-trigger w-full flex items-center justify-between gap-2 border text-left transition-all bg-white shadow-sm',
          isCompact ? 'min-h-8 px-2 py-1.5 text-xs rounded-[10px]' : 'min-h-11 px-3.5 py-2.5 text-sm rounded-xl',
          open
            ? `ring-4 ring-offset-0 ${ringClass}`
            : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/60',
          disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed shadow-none' : '',
        ].join(' ')}
      >
        <span id={valueId} className={selected ? 'text-slate-800 truncate' : 'text-slate-500 truncate'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          aria-hidden="true"
          className={`w-4 h-4 flex-shrink-0 text-slate-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Dropdown portal ── */}
      {open && createPortal(
        <div
          ref={dropRef}
          style={dropStyle}
          className="ui-card p-0 overflow-hidden border border-slate-200 shadow-xl"
        >
          {/* Search box — only shown when options exceed threshold */}
          {showSearch && (
            <div className={`sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur ${isCompact ? 'p-1.5' : 'p-2'}`}>
              <div className="relative">
                <svg
                  aria-hidden="true"
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none ${isCompact ? 'left-2 w-3 h-3' : 'left-2.5 w-3.5 h-3.5'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeDescendant}
                  aria-label={label ? `Search ${label}` : 'Search options'}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setActiveIndex(0) }}
                  onKeyDown={handleListKeyDown}
                  placeholder="Type to search…"
                  className={[
                    'ui-select-search w-full border border-slate-200 focus:ring-2 focus:ring-blue-500 bg-slate-50',
                    isCompact ? 'min-h-8 pl-7 pr-2.5 py-1.5 text-xs rounded-[10px]' : 'min-h-10 pl-8 pr-3 py-2 text-sm rounded-xl',
                  ].join(' ')}
                />
              </div>
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {search.trim() === '' ? '' : filtered.length === 0 ? 'No results found' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
          </p>

          {/* Options list */}
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-labelledby={label ? undefined : ariaLabelledby}
            aria-activedescendant={showSearch ? undefined : activeDescendant}
            onKeyDown={showSearch ? undefined : handleListKeyDown}
            className="max-h-56 overflow-y-auto focus:outline-none"
          >
            {filtered.length === 0 ? (
              <div role="presentation" aria-hidden="true" className="ui-empty px-4 py-5">No results found</div>
            ) : (
              filtered.map((opt, index) => {
                const isSelected = opt.value === value
                const isActive = index === activeIndex
                return (
                  <div
                    key={opt.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onMouseDown={e => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(opt)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      selectOption(opt)
                    }}
                    className={[
                      'ui-select-option w-full flex items-center gap-2.5 text-left transition-colors cursor-pointer',
                      isCompact ? 'px-2 py-1.5 text-xs' : 'px-3.5 py-3 text-sm',
                      isSelected
                        ? `${accentBg} ${accentText}`
                        : isActive ? 'bg-slate-100 text-slate-800' : 'text-slate-700',
                      isActive ? 'outline outline-2 -outline-offset-2 outline-sky-700' : '',
                    ].join(' ')}
                  >
                    {/* Checkmark — occupies space even when not selected to keep alignment */}
                    <svg
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? accentText : 'invisible'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className={isSelected ? 'font-medium' : ''}>{opt.label}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>,
        portalTarget
      )}
    </div>
  )
}
