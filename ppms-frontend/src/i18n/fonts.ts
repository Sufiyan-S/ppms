let devanagariFontLoad: Promise<void> | null = null

/** Adds the self-hosted Noto Sans Devanagari faces (400/500/600) once; English screens never download them. */
export function loadDevanagariFont(): Promise<void> {
  devanagariFontLoad ??= Promise.all([
    import('@fontsource/noto-sans-devanagari/devanagari-400.css'),
    import('@fontsource/noto-sans-devanagari/devanagari-500.css'),
    import('@fontsource/noto-sans-devanagari/devanagari-600.css'),
  ]).then(
    () => undefined,
    (error: unknown) => {
      devanagariFontLoad = null
      console.error('Could not load the Devanagari font; the device font is used instead', error)
    },
  )
  return devanagariFontLoad
}

/** Prints once the page's fonts have loaded, so Hindi or Marathi text is not printed in a fallback font. */
export async function printWhenFontsReady(): Promise<void> {
  try {
    await document.fonts?.ready
  } catch (error) {
    console.warn('Fonts did not finish loading; printing with what has loaded', error)
  }
  window.print()
}
