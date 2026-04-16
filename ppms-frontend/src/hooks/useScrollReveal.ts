import { useEffect, useRef } from 'react'

/**
 * Returns a ref to attach to any element. When that element scrolls into the
 * viewport (or is already visible on mount), the class `is-visible` is added,
 * triggering the `.ui-reveal` CSS transition defined in index.css.
 *
 * The observer fires once and then disconnects — elements only reveal once.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options?: IntersectionObserverInit
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px', ...options }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}
