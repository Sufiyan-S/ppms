import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PumpState {
  selectedPumpId: number | null
  setSelectedPumpId: (id: number) => void
}

/**
 * Global pump selector store.
 * Persisted to localStorage so the selected pump survives page refresh.
 * DashboardPage is responsible for initialising/validating this value when pumps load.
 * All pages read selectedPumpId from here instead of using pumps[0].
 */
export const usePumpStore = create<PumpState>()(
  persist(
    (set) => ({
      selectedPumpId: null,
      setSelectedPumpId: (id) => set({ selectedPumpId: id }),
    }),
    { name: 'ppms_selected_pump' }
  )
)
