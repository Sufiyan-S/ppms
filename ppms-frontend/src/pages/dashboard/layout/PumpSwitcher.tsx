import { useTranslation } from 'react-i18next'
import type { PumpSummary } from '../../../api/pumpApi'
import { usePumpStore } from '../../../store/usePumpStore'

export function PumpSwitcher({ pumps, variant = 'topbar' }: { pumps: PumpSummary[]; variant?: 'topbar' | 'drawer' }) {
  const { t } = useTranslation('nav')
  const { selectedPumpId, setSelectedPumpId } = usePumpStore()
  if (pumps.length === 0) return null

  return (
    <div className={`ui-dashboard-pump-switcher ${variant === 'drawer' ? 'ui-dashboard-pump-switcher--drawer' : ''}`}>
      {pumps.map(pump => (
        <button
          key={pump.id}
          onClick={() => setSelectedPumpId(pump.id)}
          aria-label={t('pumpSwitcher.switchTo', { name: pump.name })}
          aria-pressed={selectedPumpId === pump.id}
          className={`ui-dashboard-pump-chip cursor-pointer ${selectedPumpId === pump.id ? 'ui-dashboard-pump-chip--active' : ''}`}
        >
          {pump.name}
        </button>
      ))}
    </div>
  )
}
