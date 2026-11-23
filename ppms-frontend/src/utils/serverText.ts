import { codeLabel } from '../constants/labels'
import { activeLanguage, hasTranslation, translateKey } from '../i18n'
import { translatedParams } from './apiError'

export type ServerTextParams = Record<string, unknown>

/** A param named "…Codes" holding a list becomes "…": each item's enums:serverTexts.<code>_PART_<item> label, joined. */
function listParams(code: string, params: ServerTextParams | null | undefined): ServerTextParams {
  if (!params) return {}
  return Object.fromEntries(Object.entries(params)
    .filter(([name, value]) => name.endsWith('Codes') && Array.isArray(value))
    .map(([name, items]) => [
      name.slice(0, -'Codes'.length),
      (items as unknown[]).map((item) =>
        translateKey(`enums:serverTexts.${code}_PART_${String(item)}`, { defaultValue: codeLabel(String(item)) })).join(', '),
    ]))
}

/**
 * Text the server wrote in English (attention reasons, setup details, stale reasons…), shown from
 * enums:serverTexts.<code> in the user's language and filled with its params. In English, or for text
 * stored without a code, the server's own English.
 */
export function serverText(code: string | null | undefined, params: ServerTextParams | null | undefined, english: string): string {
  if (activeLanguage() === 'en' || !code) return english
  const key = `enums:serverTexts.${code}`
  const options = { ...translatedParams(params), ...listParams(code, params) }
  return hasTranslation(key, options) ? translateKey(key, options) : english
}
