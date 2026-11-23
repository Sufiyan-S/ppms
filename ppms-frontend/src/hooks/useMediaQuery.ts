import { useCallback, useSyncExternalStore } from 'react'

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/** True while the media query matches, following window resizes; false where matchMedia is missing (tests). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => matches(query), () => false)
}
