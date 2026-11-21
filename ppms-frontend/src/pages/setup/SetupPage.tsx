import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus } from 'lucide-react'
import { pumpApi } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import type { PumpSummary } from '../../api/pumpApi'
import { Reveal } from '../../components/Reveal'
import { CreatePumpForm } from './CreatePumpForm'
import { PumpManagementPanel } from './PumpManagementPanel'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { selectedPumpId, setSelectedPumpId } = usePumpStore()

  const { data: pumps = [], isLoading } = useQuery({
    queryKey: ['myPumps'],
    queryFn: pumpApi.getMyPumps,
  })

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [createOpen, setCreateOpen] = useState(true)
  const selectedPump = pumps.find((p) => p.id === selectedPumpId) ?? null

  const handlePumpCreated = (pump: PumpSummary) => {
    queryClient.invalidateQueries({ queryKey: ['myPumps'] })
    setSelectedPumpId(pump.id)
    setCreateOpen(false)
  }

  return (
    <div className="ui-page ui-page--narrow space-y-6">

      {/* Page title */}
      <Reveal delay={60}>
      <div>
        <h1 className="ui-title-sm">Pump Setup</h1>
        <p className="ui-subtitle">
          Create pump locations, configure nozzles, set prices, manage staff and credit clients.
        </p>
      </div>
      </Reveal>

      {/* ── Create Pump card — Super Admin only (SaaS: adding a pump requires subscription change) ── */}
      {isSuperAdmin && (
        <Reveal delay={130}>
        <div className="ui-card overflow-hidden p-0">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                <Plus size={12} strokeWidth={3} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-700">Create a New Pump Location</span>
            </div>
            <ChevronDown size={14} strokeWidth={2} className={`text-slate-500 transition-transform duration-200 ${createOpen ? 'rotate-180' : ''}`} />
          </button>

          {createOpen && (
              <div className="border-t border-slate-100 px-5 pb-5 pt-2">
                <CreatePumpForm onCreated={handlePumpCreated} />
              </div>
            )}
        </div>
        </Reveal>
      )}

      {/* ── Pump management accordion ── */}
      {selectedPump && (
        <Reveal delay={200}>
        <PumpManagementPanel
          pump={selectedPump}
          onPumpUpdated={() => queryClient.invalidateQueries({ queryKey: ['myPumps'] })}
        />
        </Reveal>
      )}

      {!isLoading && pumps.length === 0 && !createOpen && (
        <div className="ui-card text-center text-sm text-slate-500 py-6">
          No pumps yet. Create one above to get started.
        </div>
      )}
    </div>
  )
}
