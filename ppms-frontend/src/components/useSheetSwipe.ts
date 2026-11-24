import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const CLOSE_DISTANCE_PX = 80
const FLICK_SPEED_PX_PER_MS = 0.5
const FLICK_MIN_DISTANCE_PX = 16
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

interface Drag {
  pointerId: number
  startY: number
  startTime: number
  offset: number
}

/**
 * Lets a bottom sheet be dragged down by any `[data-sheet-drag]` area inside the panel: the panel follows the finger,
 * and a long enough drag or a fast flick calls onSwipeDown. When that returns false (the sheet stays open) it springs back.
 */
export function useSheetSwipe(panelRef: RefObject<HTMLElement | null>, isEnabled: boolean, onSwipeDown: () => boolean) {
  const onSwipeDownRef = useRef(onSwipeDown)

  useEffect(() => {
    onSwipeDownRef.current = onSwipeDown
  }, [onSwipeDown])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !isEnabled) return
    let drag: Drag | null = null

    const springBack = () => {
      panel.style.transition = ''
      panel.style.transform = ''
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!event.isPrimary || event.button !== 0 || !(target instanceof Element)) return
      if (!target.closest('[data-sheet-drag]') || target.closest(INTERACTIVE_SELECTOR)) return
      drag = { pointerId: event.pointerId, startY: event.clientY, startTime: event.timeStamp, offset: 0 }
      panel.style.transition = 'none'
      panel.setPointerCapture?.(event.pointerId)
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      drag.offset = Math.max(0, event.clientY - drag.startY)
      panel.style.transform = drag.offset > 0 ? `translateY(${drag.offset}px)` : ''
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const { offset, startTime } = drag
      drag = null
      const speed = offset / Math.max(1, event.timeStamp - startTime)
      const isSwipe = offset > CLOSE_DISTANCE_PX || (speed > FLICK_SPEED_PX_PER_MS && offset > FLICK_MIN_DISTANCE_PX)
      if (!isSwipe || !onSwipeDownRef.current()) springBack()
    }
    const handlePointerCancel = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      drag = null
      springBack()
    }

    panel.addEventListener('pointerdown', handlePointerDown)
    panel.addEventListener('pointermove', handlePointerMove)
    panel.addEventListener('pointerup', handlePointerUp)
    panel.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      panel.removeEventListener('pointerdown', handlePointerDown)
      panel.removeEventListener('pointermove', handlePointerMove)
      panel.removeEventListener('pointerup', handlePointerUp)
      panel.removeEventListener('pointercancel', handlePointerCancel)
      springBack()
    }
  }, [panelRef, isEnabled])
}
