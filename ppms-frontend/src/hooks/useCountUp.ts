import { useState, useEffect, useRef } from 'react'

/**
 * Animates from 0 to `target` over `duration` ms using an ease-out cubic curve.
 * Returns the current animated value so the caller can render it directly.
 */
export function useCountUp(target: number, duration = 700): number {
  const [count, setCount] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (target === 0) { setCount(0); return }
    let startTs: number | null = null
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const progress = Math.min((ts - startTs) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return count
}
