import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CommandPalette } from './CommandPalette'

function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
}

/** The top bar's "Jump to…" button; Ctrl+K (⌘K on a Mac) opens the same palette from anywhere. */
export function CommandPaletteLauncher() {
  const { t } = useTranslation('nav')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const openOnShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', openOnShortcut)
    return () => document.removeEventListener('keydown', openOnShortcut)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className="ui-command-button"
      >
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <span>{t('palette.open')}</span>
        <kbd aria-hidden="true">{isApplePlatform() ? t('palette.shortcutMac') : t('palette.shortcutOther')}</kbd>
      </button>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  )
}
