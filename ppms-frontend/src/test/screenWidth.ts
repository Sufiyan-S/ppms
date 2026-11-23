import { afterEach } from 'vitest'

// jsdom has no matchMedia, so useMediaQuery reports false (narrower than every breakpoint) unless a test sets a width.
export function setScreenWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList
  }) as typeof window.matchMedia
}

/** Removes the width a test set, so the next test starts without matchMedia again. */
export function resetScreenWidthAfterEach() {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })
}
