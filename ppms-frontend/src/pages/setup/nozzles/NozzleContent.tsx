import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { PumpSummary } from '../../../api/pumpApi'
import { useToastStore } from '../../../store/toastStore'
import { useInvalidateNozzles } from './nozzlePanels'
import type { NozzlePanel } from './nozzlePanels'
import { DuCard } from './DuCard'
import { IncreaseDuLimit } from './IncreaseDuLimit'
import { CreateDuForm } from './CreateDuForm'

export function NozzleContent({ pump, onAdded }: { pump: PumpSummary; onAdded: () => void }) {
  const { t } = useTranslation('setup')
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pump.id)

  // Panel visibility — one panel open at a time across all nozzles
  const [openPanel, setOpenPanel] = useState<{ nozzleId: number; panel: NozzlePanel } | null>(null)

  // Kebab menu — which nozzle's action menu is open
  const [openMenu, setOpenMenu] = useState<number | null>(null)

  const [statusError, setStatusError] = useState<string | null>(null)

  // Fetch ALL DUs (active + inactive)
  const { data: allDUs = [] } = useQuery({
    queryKey: ['dus', pump.id],
    queryFn: () => pumpApi.getDUs(pump.id),
  })

  // Tanks needed for the Map Tanks panel
  const { data: tanks = [] } = useQuery({
    queryKey: ['tanks', pump.id],
    queryFn: () => pumpApi.getTanks(pump.id),
  })

  const statusMutation = useMutation({
    mutationFn: ({ pumpId, duId, nozzleId, status }: { pumpId: number; duId: number; nozzleId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      pumpApi.updateNozzleStatus(pumpId, duId, nozzleId, status),
    onSuccess: (_, { status }) => { setOpenPanel(null); setStatusError(null); addToast(status === 'ACTIVE' ? t('nozzles.enabled') : t('nozzles.disabled'), 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.statusFailed')); setStatusError(msg); addToast(msg, 'error') },
  })

  // Per-DU inline "Add Nozzle" state
  const [addNozzleDuId, setAddNozzleDuId] = useState<number | null>(null)

  const openPanelFor = (nozzleId: number, panel: NozzlePanel) => {
    setOpenPanel((prev) =>
      prev?.nozzleId === nozzleId && prev?.panel === panel ? null : { nozzleId, panel }
    )
    setStatusError(null)
  }

  const panelFor = (nozzleId: number) =>
    openPanel?.nozzleId === nozzleId ? openPanel.panel : null

  const refreshPump = () => { invalidate(); onAdded() }

  const activeDUCount = allDUs.filter((d) => d.status === 'ACTIVE').length

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">
        {t('nozzles.intro')}
      </p>

      {/* Existing DUs (active + inactive) */}
      {allDUs.length > 0 && (
        <div className="space-y-4">
          {allDUs.map((du) => (
            <DuCard
              key={du.id}
              pumpId={pump.id}
              du={du}
              tanks={tanks}
              openPanelFor={panelFor}
              onOpenPanel={openPanelFor}
              onClosePanel={() => setOpenPanel(null)}
              openMenu={openMenu}
              onMenuChange={setOpenMenu}
              statusPending={statusMutation.isPending}
              statusError={statusError}
              onStatusChange={(nozzleId, status) => statusMutation.mutate({ pumpId: pump.id, duId: du.id, nozzleId, status })}
              addingNozzle={addNozzleDuId === du.id}
              onStartAddNozzle={() => setAddNozzleDuId(du.id)}
              onStopAddNozzle={() => setAddNozzleDuId(null)}
            />
          ))}
        </div>
      )}

      {/* Create DU form or max-reached notice */}
      <div className="ui-card-plain p-4">
        {activeDUCount >= pump.maxDuCount ? (
          <IncreaseDuLimit pump={pump} onUpdated={refreshPump} />
        ) : (
          <CreateDuForm pumpId={pump.id} onCreated={refreshPump} />
        )}
      </div>
    </div>
  )
}
