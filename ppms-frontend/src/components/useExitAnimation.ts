import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Longest the exit animation may take before onClose runs anyway, so a lost animationend never leaves a dialog open. */
const EXIT_FALLBACK_MS = 250

function hasCssAnimation(panel: HTMLElement): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const name = window.getComputedStyle(panel).animationName
  return Boolean(name) && name !== 'none'
}

/**
 * Plays the panel's exit animation (driven by `data-closing` in CSS) before calling onClose.
 * Without a CSS animation (reduced motion, or tests where no stylesheet loads) onClose runs straight away.
 */
export function useExitAnimation(panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const [isClosing, setIsClosing] = useState(false)
  const isClosingRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const close = useCallback(() => {
    if (isClosingRef.current) return
    const panel = panelRef.current
    if (!panel || !hasCssAnimation(panel)) {
      onCloseRef.current()
      return
    }
    isClosingRef.current = true
    setIsClosing(true)
  }, [panelRef])

  useEffect(() => {
    const panel = panelRef.current
    if (!isClosing || !panel) return
    let isFinished = false
    const finish = () => {
      if (isFinished) return
      isFinished = true
      isClosingRef.current = false
      setIsClosing(false)
      onCloseRef.current()
    }
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target === panel) finish()
    }
    panel.addEventListener('animationend', handleAnimationEnd)
    const timer = window.setTimeout(finish, EXIT_FALLBACK_MS)
    return () => {
      panel.removeEventListener('animationend', handleAnimationEnd)
      window.clearTimeout(timer)
    }
  }, [isClosing, panelRef])

  return { isClosing, close }
}
