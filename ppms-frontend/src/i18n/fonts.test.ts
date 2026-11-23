import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeAppLanguage } from './index'
import { printWhenFontsReady } from './fonts'

const loadedFontFiles = vi.hoisted(() => [] as string[])

vi.mock('@fontsource/noto-sans-devanagari/devanagari-400.css', () => { loadedFontFiles.push('400'); return {} })
vi.mock('@fontsource/noto-sans-devanagari/devanagari-500.css', () => { loadedFontFiles.push('500'); return {} })
vi.mock('@fontsource/noto-sans-devanagari/devanagari-600.css', () => { loadedFontFiles.push('600'); return {} })

afterEach(async () => {
  await changeAppLanguage('en')
})

describe('Devanagari font', () => {
  it('is not downloaded for English, and loaded once for Hindi or Marathi', async () => {
    await changeAppLanguage('en')
    expect(loadedFontFiles).toEqual([])

    await changeAppLanguage('hi')
    await vi.waitFor(() => expect([...loadedFontFiles].sort()).toEqual(['400', '500', '600']))

    await changeAppLanguage('mr')
    expect(loadedFontFiles).toHaveLength(3)
  })

  it('sets the page language for screen readers and the :lang styles', async () => {
    await changeAppLanguage('mr')
    expect(document.documentElement.lang).toBe('mr')
    await changeAppLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('printWhenFontsReady', () => {
  it('waits for the fonts before printing', async () => {
    let fontsLoaded: () => void = () => {}
    const ready = new Promise<void>((resolve) => { fontsLoaded = resolve })
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } })
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})

    const printing = printWhenFontsReady()
    await Promise.resolve()
    expect(print).not.toHaveBeenCalled()

    fontsLoaded()
    await printing
    expect(print).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(document, 'fonts')
  })
})
