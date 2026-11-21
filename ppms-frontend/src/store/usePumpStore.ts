import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PumpState {
  selectedPumpId: number | null
  /** Pump the server refused with "Pump is suspended"; not persisted, so a reload asks the server again. */
  suspendedPumpId: number | null
  setSelectedPumpId: (id: number) => void
  markPumpSuspended: (id: number) => void
  clearSelectedPump: () => void
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
      suspendedPumpId: null,
      setSelectedPumpId: (id) => set({ selectedPumpId: id }),
      markPumpSuspended: (id) => set({ suspendedPumpId: id }),
      clearSelectedPump: () => set({ selectedPumpId: null, suspendedPumpId: null }),
    }),
    {
      name: 'ppms_selected_pump',
      partialize: (state) => ({ selectedPumpId: state.selectedPumpId }),
    }
  )
)
