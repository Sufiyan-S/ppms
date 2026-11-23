import { Outlet, useLocation } from 'react-router-dom'
import { usePumpStore } from '../../../store/usePumpStore'

// Keyed by pump too, so switching pump drops page state (open client, page number) from the previous pump.
export function RouteOutlet() {
  const { pathname } = useLocation()
  const selectedPumpId = usePumpStore((state) => state.selectedPumpId)
  return (
    <div key={`${pathname}:${selectedPumpId ?? 'none'}`}>
      <Outlet />
    </div>
  )
}
