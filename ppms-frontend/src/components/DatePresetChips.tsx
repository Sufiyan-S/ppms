import { useTranslation } from 'react-i18next'
import { DATE_PRESETS, matchingPreset, presetRange } from '../utils/datePresets'
import type { DateRange } from '../utils/datePresets'

/** Quick ranges (Today … FY to date) next to the From/To inputs; the chip matching the current range is pressed. */
export function DatePresetChips({ range, onSelect }: { range: DateRange; onSelect: (range: DateRange) => void }) {
  const { t } = useTranslation()
  const active = matchingPreset(range)
  return (
    <div className="ui-chip-row print:hidden" role="group" aria-label={t('datePresets.groupLabel')}>
      {DATE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="ui-chip"
          aria-pressed={active === preset.id}
          onClick={() => onSelect(presetRange(preset.id))}
        >
          {t(`datePresets.${preset.id}`)}
        </button>
      ))}
    </div>
  )
}
