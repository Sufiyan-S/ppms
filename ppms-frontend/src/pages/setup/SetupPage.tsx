import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { shiftPlanApi } from '../../api/shiftPlanApi'
import type { PreferredDayOff } from '../../api/shiftPlanApi'
import { DAY_LABELS } from '../../api/shiftPlanApi'
import type { CreateUserRequest, StaffMember, UserGender } from '../../api/userApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import type { PumpSummary, CreditClient, TankInfo, UpdateCreditClientRequest, PriceDeviationWarning } from '../../api/pumpApi'
import type { FuelType, DUOption, NozzleDetail } from '../../types/shift'
import { dipApi } from '../../api/dipApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import type { CreateShiftDefinitionRequest } from '../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { formatIstDate, localDateInputValue } from '../../utils/date'

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
      <div>
        <h2 className="ui-title-sm">Pump Setup</h2>
        <p className="ui-subtitle">
          Create pump locations, configure nozzles, set prices, manage staff and credit clients.
        </p>
      </div>

      {/* ── Create Pump card — Super Admin only (SaaS: adding a pump requires subscription change) ── */}
      {isSuperAdmin && (
        <div className="ui-card overflow-hidden p-0">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">
                +
              </span>
              <span className="text-sm font-semibold text-slate-700">Create a New Pump Location</span>
            </div>
            <span className="text-slate-400 text-sm">{createOpen ? '▲' : '▼'}</span>
          </button>

          {createOpen && (
              <div className="border-t border-slate-100 px-5 pb-5 pt-2">
                <CreatePumpForm onCreated={handlePumpCreated} />
              </div>
            )}
        </div>
      )}

      {/* ── Pump management accordion ── */}
      {selectedPump && (
        <PumpManagementPanel
          pump={selectedPump}
          onPumpUpdated={() => queryClient.invalidateQueries({ queryKey: ['myPumps'] })}
        />
      )}

      {!isLoading && pumps.length === 0 && !createOpen && (
        <div className="ui-card text-center text-sm text-slate-400 py-6">
          No pumps yet. Create one above to get started.
        </div>
      )}
    </div>
  )
}

// ── Pump management accordion panel ──────────────────────────────────────────

type SectionKey = 'nozzles' | 'tanks' | 'prices' | 'staff' | 'clients' | 'shifts'

function PumpManagementPanel({
  pump,
  onPumpUpdated,
}: {
  pump: PumpSummary
  onPumpUpdated: () => void
}) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null)

  // Load summary data for accordion headers
  const { data: currentPrices = [] } = useQuery({
    queryKey: ['fuelPrices', pump.id],
    queryFn:  () => pumpApi.getCurrentPrices(pump.id),
  })
  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pump.id],
    queryFn:  () => userApi.getStaff(pump.id),
  })
  const { data: clients = [] } = useQuery({
    queryKey: ['creditClients', pump.id],
    queryFn:  () => pumpApi.getCreditClients(pump.id),
  })
  const rootClientCount = clients.filter((client) => client.parentClientId === null).length
  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-definitions', pump.id],
    queryFn:  () => shiftDefinitionApi.getAll(pump.id),
  })

  const toggle = (key: SectionKey) =>
    setOpenSection((prev) => (prev === key ? null : key))

  const priceSummary = currentPrices.length > 0
    ? currentPrices.map((p) => `${p.fuelType.charAt(0)}: ₹${p.pricePerUnit}`).join(' · ')
    : 'Not set'

  return (
    <div className="ui-card p-0">

      {/* Pump identity header */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-700 to-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-base">{pump.name}</h3>
            <p className="text-slate-400 text-xs mt-0.5">{pump.address}</p>
          </div>
          <div className="flex gap-2">
            <span className="bg-white/10 text-slate-300 text-xs px-2.5 py-1 rounded-full">
              {pump.dus.length}/{pump.maxDuCount} DUs
            </span>
          </div>
        </div>
      </div>

      {/* Accordion sections */}
      <div className="divide-y divide-slate-100">

        {/* ── Nozzles ── */}
        <AccordionSection
          sectionKey="nozzles"
          open={openSection === 'nozzles'}
          onToggle={() => toggle('nozzles')}
          icon="⚙️"
          title="Dispensary Units"
          summary={`${pump.dus.length} of ${pump.maxDuCount} DUs configured`}
          badgeColor="bg-slate-100 text-slate-600"
        >
          <NozzleContent pump={pump} onAdded={onPumpUpdated} />
        </AccordionSection>

        {/* ── Tanks ── */}
        <AccordionSection
          sectionKey="tanks"
          open={openSection === 'tanks'}
          onToggle={() => toggle('tanks')}
          icon="🛢"
          title="Underground Tanks"
          summary={pump.dus.length > 0 ? 'Tap to configure capacity' : 'Add a DU first'}
          badgeColor="bg-blue-50 text-blue-700"
        >
          <TanksContent pump={pump} />
        </AccordionSection>

        {/* ── Fuel Prices ── */}
        <AccordionSection
          sectionKey="prices"
          open={openSection === 'prices'}
          onToggle={() => toggle('prices')}
          icon="💰"
          title="Fuel Prices"
          summary={priceSummary}
          badgeColor="bg-emerald-50 text-emerald-700"
        >
          <FuelPricesContent pump={pump} currentPrices={currentPrices} />
        </AccordionSection>

        {/* ── Staff ── */}
        <AccordionSection
          sectionKey="staff"
          open={openSection === 'staff'}
          onToggle={() => toggle('staff')}
          icon="👥"
          title="Staff"
          summary={staff.length > 0 ? `${staff.length} member${staff.length !== 1 ? 's' : ''}` : 'None added'}
          badgeColor="bg-blue-50 text-blue-700"
        >
          <StaffContent pump={pump} />
        </AccordionSection>

        {/* ── Credit Clients ── */}
        <AccordionSection
          sectionKey="clients"
          open={openSection === 'clients'}
          onToggle={() => toggle('clients')}
          icon="🤝"
          title="Credit Clients"
          summary={rootClientCount > 0 ? `${rootClientCount} client${rootClientCount !== 1 ? 's' : ''}` : 'None added'}
          badgeColor="bg-orange-50 text-orange-700"
        >
          <CreditClientsContent pump={pump} />
        </AccordionSection>

        {/* ── Shift Definitions ── */}
        <AccordionSection
          sectionKey="shifts"
          open={openSection === 'shifts'}
          onToggle={() => toggle('shifts')}
          icon="🕐"
          title="Shift Definitions"
          summary={(() => {
            const groupCount = new Set(shiftDefs.map(d => `${d.effectiveFrom}|${d.effectiveTo ?? 'open'}`)).size
            return groupCount > 0 ? `${groupCount} schedule${groupCount !== 1 ? 's' : ''}` : 'Not configured'
          })()}
          badgeColor="bg-violet-50 text-violet-700"
        >
          <ShiftDefinitionsContent pumpId={pump.id} />
        </AccordionSection>

      </div>
    </div>
  )
}

// ── Accordion section wrapper ─────────────────────────────────────────────────

function AccordionSection({
  open,
  onToggle,
  icon,
  title,
  summary,
  badgeColor,
  children,
}: {
  sectionKey: SectionKey
  open: boolean
  onToggle: () => void
  icon: string
  title: string
  summary: string
  badgeColor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
            {summary}
          </span>
        </div>
        <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {open && (
        <div className="px-5 pb-6 pt-2 border-t border-slate-100 bg-slate-50/30">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Create pump form ──────────────────────────────────────────────────────────

function CreatePumpForm({ onCreated }: { onCreated: (p: PumpSummary) => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [maxDUs, setMaxDUs] = useState('4')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: pumpApi.createPump,
    onSuccess: (pump) => {
      setName('')
      setAddress('')
      setMaxNozzles('4')
      setError(null)
      onCreated(pump)
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to create pump'),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    mutation.mutate({ name, address, maxDuCount: Number(maxDUs) })
  }

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="ui-label">Pump Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Road Pump"
            className="text-sm"
          />
        </div>
        <div>
          <label className="ui-label">Max DUs</label>
          <input
            required
            type="number"
            min="1"
            max="20"
            value={maxDUs}
            onChange={(e) => setMaxDUs(e.target.value)}
            className="text-sm"
          />
        </div>
      </div>
      <div>
        <label className="ui-label">Address</label>
        <input
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 123, MG Road, Bangalore"
          className="text-sm"
        />
      </div>
      {error && <p className="ui-error-text">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="ui-btn ui-btn-primary"
      >
        {mutation.isPending ? 'Creating...' : 'Create Pump'}
      </button>
    </form>
  )
}

// ── Shared fuel-type display helpers ─────────────────────────────────────────

const ALL_FUEL_TYPES: FuelType[] = ['PETROL', 'SPEED_PETROL', 'DIESEL', 'SPEED_DIESEL', 'CNG']

const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol', DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}
const FUEL_UNIT: Record<string, string> = {
  PETROL: 'L', SPEED_PETROL: 'L', DIESEL: 'L', SPEED_DIESEL: 'L', CNG: 'kg',
}
const FUEL_COLOR: Record<string, string> = {
  PETROL:       'bg-emerald-100 text-emerald-700 border-emerald-300',
  SPEED_PETROL: 'bg-teal-100 text-teal-700 border-teal-300',
  DIESEL:       'bg-blue-100 text-blue-700 border-blue-300',
  SPEED_DIESEL: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  CNG:          'bg-amber-100 text-amber-700 border-amber-300',
}

const FUEL_PICKER_THEME: Record<string, string> = {
  PETROL: 'ui-fuel-pill--petrol',
  SPEED_PETROL: 'ui-fuel-pill--speed-petrol',
  DIESEL: 'ui-fuel-pill--diesel',
  SPEED_DIESEL: 'ui-fuel-pill--speed-diesel',
  CNG: 'ui-fuel-pill--cng',
}

// ── DU / Nozzle content ───────────────────────────────────────────────────────

function NozzleContent({ pump, onAdded }: { pump: PumpSummary; onAdded: () => void }) {
  const queryClient = useQueryClient()

  // Panel visibility — one panel open at a time per nozzle
  type NozzlePanel = 'mapTank' | 'reading' | 'disable' | 'dip'
  const [openPanel, setOpenPanel] = useState<{ nozzleId: number; panel: NozzlePanel } | null>(null)

  // Kebab menu — which nozzle's action menu is open
  const [openMenu, setOpenMenu] = useState<number | null>(null)

  // Create DU form state
  const [duName, setDuName] = useState('')
  const [duNozzles, setDuNozzles] = useState<Array<{ nozzleNumber: string; fuelType: FuelType | ''; initialReading: string }>>([
    { nozzleNumber: '1', fuelType: '', initialReading: '' },
  ])
  const [addError, setAddError] = useState<string | null>(null)

  // Per-nozzle panel state
  const [tankSelection, setTankSelection] = useState<number | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Adjust Reading panel state
  const [adjustType, setAdjustType] = useState<'RESET' | 'CUSTOM_READING'>('CUSTOM_READING')
  const [adjustReading, setAdjustReading] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)

  // Record Dip panel state
  const [dipLitres, setDipLitres] = useState('')
  const [dipDate, setDipDate] = useState('')
  const [dipReason, setDipReason] = useState('')
  const [dipError, setDipError] = useState<string | null>(null)

  // Increase max DU count
  const [showIncreaseMax, setShowIncreaseMax] = useState(false)
  const [newMaxCount, setNewMaxCount] = useState('')
  const [increaseError, setIncreaseError] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dus', pump.id] })
    queryClient.invalidateQueries({ queryKey: ['myPumps'] })
  }

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

  // Current prices — needed to compute dip loss preview
  const { data: currentPrices = [] } = useQuery({
    queryKey: ['currentPrices', pump.id],
    queryFn: () => pumpApi.getCurrentPrices(pump.id),
  })

  const createDUMutation = useMutation({
    mutationFn: (req: { name: string; nozzles: Array<{ nozzleNumber: number; fuelType: FuelType; initialReading?: number }> }) =>
      pumpApi.createDU(pump.id, req),
    onSuccess: () => {
      setDuName('')
      setDuNozzles([{ nozzleNumber: '1', fuelType: '', initialReading: '' }])
      setAddError(null)
      invalidate(); onAdded()
    },
    onError: (err: any) => setAddError(err?.response?.data?.message ?? 'Failed to create DU'),
  })

  const recordAdjustmentMutation = useMutation({
    mutationFn: ({ nozzleId, adjustmentType, reason, newReading }: { nozzleId: number; adjustmentType: 'RESET' | 'CUSTOM_READING'; reason: string; newReading?: number }) =>
      dipApi.recordAdjustment(pump.id, nozzleId, adjustmentType, reason, newReading),
    onSuccess: () => { setOpenPanel(null); setAdjustError(null); setAdjustReason(''); setAdjustReading(''); invalidate() },
    onError: (err: any) => setAdjustError(err?.response?.data?.message ?? 'Failed to record adjustment'),
  })

  const recordDipMutation = useMutation({
    mutationFn: ({ fuelType, litresRemoved, reason, date }: { fuelType: string; litresRemoved: number; reason: string; date?: string }) =>
      dipApi.recordDip(pump.id, fuelType, litresRemoved, reason, date),
    onSuccess: () => { setOpenPanel(null); setDipError(null); setDipLitres(''); setDipReason(''); setDipDate(''); invalidate() },
    onError: (err: any) => setDipError(err?.response?.data?.message ?? 'Failed to record dip'),
  })

  const mapTankMutation = useMutation({
    mutationFn: ({ pumpId, duId, nozzleId, tankId }: { pumpId: number; duId: number; nozzleId: number; tankId: number | null }) =>
      pumpApi.mapNozzleToTank(pumpId, duId, nozzleId, tankId),
    onSuccess: () => { setOpenPanel(null); invalidate() },
    onError: (err: any) => setMapError(err?.response?.data?.message ?? 'Failed to save tank mapping'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ pumpId, duId, nozzleId, status }: { pumpId: number; duId: number; nozzleId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      pumpApi.updateNozzleStatus(pumpId, duId, nozzleId, status),
    onSuccess: () => { setOpenPanel(null); setStatusError(null); invalidate() },
    onError: (err: any) => setStatusError(err?.response?.data?.message ?? 'Failed to update nozzle status'),
  })

  const increaseMaxMutation = useMutation({
    mutationFn: (count: number) => pumpApi.updateMaxDuCount(pump.id, count),
    onSuccess: () => {
      setShowIncreaseMax(false); setNewMaxCount(''); setIncreaseError(null)
      invalidate(); onAdded()
    },
    onError: (err: any) => setIncreaseError(err?.response?.data?.message ?? 'Failed to update DU limit'),
  })

  // Per-DU inline "Add Nozzle" state
  const [addNozzleDuId, setAddNozzleDuId] = useState<number | null>(null)
  const [inlineNozzleNumber, setInlineNozzleNumber] = useState('')
  const [inlineFuelType, setInlineFuelType] = useState<FuelType | ''>('')
  const [inlineReading, setInlineReading] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const addNozzleMutation = useMutation({
    mutationFn: ({ duId, nozzleNumber, fuelType, initialReading }: { duId: number; nozzleNumber: number; fuelType: FuelType; initialReading?: number }) =>
      pumpApi.addNozzle(pump.id, duId, nozzleNumber, fuelType, initialReading),
    onSuccess: () => {
      setAddNozzleDuId(null); setInlineNozzleNumber(''); setInlineFuelType(''); setInlineReading(''); setInlineError(null)
      invalidate()
    },
    onError: (err: any) => setInlineError(err?.response?.data?.message ?? 'Failed to add nozzle'),
  })

  const submitInlineNozzle = (e: React.FormEvent, du: DUOption) => {
    e.preventDefault(); setInlineError(null)
    if (!inlineFuelType) { setInlineError('Select a fuel type.'); return }
    if (!inlineNozzleNumber) { setInlineError('Enter a nozzle number.'); return }
    addNozzleMutation.mutate({
      duId: du.id,
      nozzleNumber: Number(inlineNozzleNumber),
      fuelType: inlineFuelType as FuelType,
      initialReading: inlineReading ? Number(inlineReading) : undefined,
    })
  }

  const openPanelFor = (nozzleId: number, panel: NozzlePanel, nozzle?: NozzleDetail) => {
    setOpenPanel((prev) =>
      prev?.nozzleId === nozzleId && prev?.panel === panel ? null : { nozzleId, panel }
    )
    setAdjustError(null); setMapError(null); setStatusError(null); setDipError(null)
    if (panel === 'reading') {
      setAdjustReading('')
      setAdjustType('CUSTOM_READING')
      setAdjustReason('')
    }
    if (panel === 'dip') {
      setDipLitres(''); setDipDate(''); setDipReason('')
    }
    if (panel === 'mapTank' && nozzle) {
      setTankSelection(nozzle.tankId ?? null)
    }
  }

  const isOpen = (nozzleId: number, panel: NozzlePanel) =>
    openPanel?.nozzleId === nozzleId && openPanel?.panel === panel

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    if (!duName.trim()) { setAddError('Enter a DU name.'); return }
    const validNozzles = duNozzles.filter((n) => n.nozzleNumber && n.fuelType)
    if (validNozzles.length === 0) { setAddError('Add at least one nozzle with a fuel type.'); return }
    createDUMutation.mutate({
      name: duName.trim(),
      nozzles: validNozzles.map((n) => ({
        nozzleNumber: Number(n.nozzleNumber),
        fuelType: n.fuelType as FuelType,
        initialReading: n.initialReading ? Number(n.initialReading) : undefined,
      })),
    })
  }

  const submitAdjustment = async (e: React.FormEvent, nozzle: NozzleDetail) => {
    e.preventDefault(); setAdjustError(null)
    if (!adjustReason.trim()) { setAdjustError('Please provide a reason.'); return }
    if (adjustType === 'CUSTOM_READING') {
      if (!adjustReading) { setAdjustError('Enter a new reading.'); return }
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'CUSTOM_READING',
        reason: adjustReason,
        newReading: Number(adjustReading),
      })
    } else {
      await recordAdjustmentMutation.mutateAsync({
        nozzleId: nozzle.id,
        adjustmentType: 'RESET',
        reason: adjustReason,
      })
    }
  }

  const submitDip = (e: React.FormEvent, nozzle: NozzleDetail) => {
    e.preventDefault(); setDipError(null)
    if (!dipLitres || Number(dipLitres) <= 0) { setDipError('Enter a valid litres amount.'); return }
    if (!dipReason.trim()) { setDipError('Please provide a reason.'); return }
    recordDipMutation.mutate({
      fuelType: nozzle.fuelType,
      litresRemoved: Number(dipLitres),
      reason: dipReason,
      date: dipDate || undefined,
    })
  }

  const activeDUCount = allDUs.filter((d) => d.status === 'ACTIVE').length

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Each Dispensary Unit (DU) is a physical MPD machine. Add one or more nozzles to each DU — each nozzle carries exactly one fuel type with its own meter counter.
        CNG nozzles cannot share a DU with other fuel types.
      </p>

      {/* Existing DUs (active + inactive) */}
      {allDUs.length > 0 && (
        <div className="space-y-3">
          {allDUs.map((du) => {
            const isDUInactive = du.status === 'INACTIVE'
            return (
              <div key={du.id} className={`border rounded-xl bg-white transition-opacity ${isDUInactive ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                {/* DU header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-t-xl border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">DU #{du.duNumber}</span>
                    <span className="text-sm font-bold text-slate-700">{du.name}</span>
                    {isDUInactive && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-orange-50 text-orange-700 border-orange-200">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{du.nozzles.filter((n) => n.status === 'ACTIVE').length} active nozzle(s)</span>
                    {!isDUInactive && du.nozzles.length < 9 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddNozzleDuId(addNozzleDuId === du.id ? null : du.id)
                          setInlineNozzleNumber(String(du.nozzles.length + 1))
                          setInlineFuelType(''); setInlineReading(''); setInlineError(null)
                        }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded-md transition-colors"
                      >
                        {addNozzleDuId === du.id ? 'Cancel' : '+ Add Nozzle'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Nozzle rows inside this DU */}
                <div className="divide-y divide-slate-50">
                  {du.nozzles.map((nozzle) => {
                    const isInactive = nozzle.status === 'INACTIVE'
                    return (
                      <div key={nozzle.id} className={`transition-opacity ${isInactive ? 'opacity-60' : ''}`}>
                        {/* Nozzle row */}
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-700">#{nozzle.nozzleNumber}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FUEL_COLOR[nozzle.fuelType] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {FUEL_LABEL[nozzle.fuelType] ?? nozzle.fuelType}
                            </span>
                            {isInactive && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium border bg-orange-50 text-orange-700 border-orange-200">
                                Maintenance
                              </span>
                            )}
                            {!isInactive && (
                              <span className="text-xs text-slate-400">
                                {FUEL_LABEL[nozzle.fuelType]}: {nozzle.lastReading}
                              </span>
                            )}
                            {!isInactive && nozzle.tankId == null && (
                              <span className="text-xs text-amber-600 font-medium">⚠ tank not mapped</span>
                            )}
                          </div>

                          <div className="flex shrink-0 ml-2 items-center gap-2">
                            {isInactive ? (
                              <button
                                type="button"
                                onClick={() => statusMutation.mutate({ pumpId: pump.id, duId: du.id, nozzleId: nozzle.id, status: 'ACTIVE' })}
                                disabled={statusMutation.isPending}
                                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium border border-emerald-300 hover:border-emerald-500 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                              >
                                {statusMutation.isPending ? 'Enabling…' : 'Enable'}
                              </button>
                            ) : (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenMenu(openMenu === nozzle.id ? null : nozzle.id)}
                                  className="ui-btn ui-btn-ghost min-h-0 p-1.5 text-base leading-none text-slate-400 hover:text-slate-600"
                                  title="Nozzle actions"
                                >
                                  ⋮
                                </button>
                                {openMenu === nozzle.id && (
                                  <>
                                    <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenu(null)} />
                                    <div className="absolute right-0 top-full z-[6] mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur">
                                      {(
                                        [
                                          { label: 'Map Tank', description: 'Assign the supply tank', icon: '🛢', panel: 'mapTank'  as NozzlePanel, color: 'text-emerald-700 hover:bg-emerald-50' },
                                          { label: 'Adjust Reading', description: 'Correct stored meter value', icon: '🔧', panel: 'reading'  as NozzlePanel, color: 'text-blue-600 hover:bg-blue-50' },
                                          { label: 'Record Dip', description: 'Log a manual dip check', icon: '📏', panel: 'dip'      as NozzlePanel, color: 'text-orange-600 hover:bg-orange-50' },
                                          { label: 'Disable for Maintenance', description: 'Temporarily take nozzle offline', icon: '⛔', panel: 'disable' as NozzlePanel, color: 'text-red-600 hover:bg-red-50' },
                                        ] as const
                                      ).map(({ label, description, icon, panel, color }) => (
                                        <button
                                          key={panel}
                                          type="button"
                                          onClick={() => {
                                            openPanelFor(nozzle.id, panel, nozzle)
                                            setOpenMenu(null)
                                          }}
                                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${color}`}
                                        >
                                          <span className="mt-0.5 shrink-0 text-sm leading-none">{icon}</span>
                                          <span className="min-w-0">
                                            <span className="block text-xs font-semibold leading-5">{label}</span>
                                            <span className="block text-[11px] leading-4 text-slate-400">{description}</span>
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Disable panel */}
                        {isOpen(nozzle.id, 'disable') && (
                          <div className="px-4 py-3 border-t border-slate-100">
                            <div className="ui-disable-editor">
                              <div className="ui-disable-editor__hero">
                                <div>
                                  <p className="ui-section-kicker mb-2">Maintenance Lock</p>
                                  <h5 className="ui-title-sm">Disable nozzle #{nozzle.nozzleNumber}</h5>
                                  <p className="ui-subtitle mt-1">Take this nozzle offline for maintenance or operational issues.</p>
                                </div>
                              </div>
                              <div className="ui-alert ui-alert-danger text-xs">
                                No new shifts can be opened on this nozzle until it is re-enabled. Close any active shift first.
                              </div>
                              {statusError && <p className="ui-error-text">{statusError}</p>}
                              <div className="ui-disable-editor__actions">
                                <button
                                  type="button"
                                  onClick={() => statusMutation.mutate({ pumpId: pump.id, duId: du.id, nozzleId: nozzle.id, status: 'INACTIVE' })}
                                  disabled={statusMutation.isPending}
                                  className="ui-btn ui-btn-danger"
                                >
                                  {statusMutation.isPending ? 'Disabling…' : 'Yes, Disable'}
                                </button>
                                <button type="button" onClick={() => setOpenPanel(null)} className="ui-btn ui-btn-secondary">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Map Tank panel */}
                        {isOpen(nozzle.id, 'mapTank') && (
                          <div className="px-4 py-3 border-t border-slate-100">
                            <div className="ui-tank-map-form">
                              <div className="ui-tank-map-form__hero">
                                <div>
                                  <p className="ui-section-kicker mb-2">Tank Mapping</p>
                                  <h5 className="ui-title-sm">Map nozzle to tank</h5>
                                  <p className="ui-subtitle mt-1">
                                    Assign nozzle #{nozzle.nozzleNumber} ({FUEL_LABEL[nozzle.fuelType]}) to the tank it draws from.
                                  </p>
                                </div>
                              </div>
                              {(() => {
                                const compatibleTanks = tanks.filter(
                                  (t) => t.fuelType === nozzle.fuelType && t.status === 'ACTIVE'
                                )
                                return (
                                  <>
                                    <SearchableSelect
                                      value={tankSelection != null ? tankSelection.toString() : ''}
                                      onChange={(v) => setTankSelection(v === '' ? null : Number(v))}
                                      placeholder="— unmap —"
                                      size="sm"
                                      options={compatibleTanks.map((t) => ({ value: t.id.toString(), label: t.tankIdentifier }))}
                                    />
                                    {compatibleTanks.length === 0 && (
                                      <p className="text-xs text-amber-600 mt-1">
                                        No active {FUEL_LABEL[nozzle.fuelType]} tanks available.
                                      </p>
                                    )}
                                  </>
                                )
                              })()}
                              {mapError && <p className="ui-error-text">{mapError}</p>}
                              <div className="ui-tank-map-form__actions">
                                <button
                                  type="button"
                                  onClick={() => mapTankMutation.mutate({ pumpId: pump.id, duId: du.id, nozzleId: nozzle.id, tankId: tankSelection })}
                                  disabled={mapTankMutation.isPending}
                                  className="ui-btn ui-btn-primary"
                                >
                                  {mapTankMutation.isPending ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={() => setOpenPanel(null)} className="ui-btn ui-btn-secondary">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Adjust Reading panel */}
                        {isOpen(nozzle.id, 'reading') && (
                          <div className="px-4 py-3 border-t border-slate-100">
                            <form onSubmit={(e) => submitAdjustment(e, nozzle)} className="ui-reading-editor">
                              <div className="ui-reading-editor__hero">
                                <div>
                                  <p className="ui-section-kicker mb-2">Meter Adjustment</p>
                                  <h5 className="ui-title-sm">Adjust meter reading</h5>
                                  <p className="ui-subtitle mt-1">
                                    Use this only when the meter was replaced, reset, or the stored reading is incorrect for nozzle #{nozzle.nozzleNumber}.
                                  </p>
                                </div>
                              </div>
                              <div className="ui-alert ui-alert-warning text-xs">
                                Cannot be done while an active shift is running on this nozzle.
                              </div>
                              <div className="ui-reading-editor__section">
                                <div className="ui-reading-editor__section-head">
                                  <div>
                                    <p className="ui-label mb-1">Adjustment type</p>
                                    <p className="ui-help mt-0">Choose whether to set an exact reading or reset this nozzle's meter to zero.</p>
                                  </div>
                                </div>
                                <div className="ui-reading-editor__mode-grid">
                                  <button
                                    type="button"
                                    onClick={() => setAdjustType('CUSTOM_READING')}
                                    className={`ui-reading-editor__mode-card ${adjustType === 'CUSTOM_READING' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--custom' : ''}`}
                                  >
                                    <span className="ui-reading-editor__mode-title">Set custom reading</span>
                                    <span className="ui-reading-editor__mode-copy">Enter a replacement reading for this nozzle.</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAdjustType('RESET')}
                                    className={`ui-reading-editor__mode-card ${adjustType === 'RESET' ? 'ui-reading-editor__mode-card--active ui-reading-editor__mode-card--danger' : ''}`}
                                  >
                                    <span className="ui-reading-editor__mode-title">Reset to zero</span>
                                    <span className="ui-reading-editor__mode-copy">Apply a full zero reset to this nozzle's meter.</span>
                                  </button>
                                </div>
                              </div>
                              {adjustType === 'CUSTOM_READING' && (
                                <div className="ui-reading-editor__section">
                                  <label className="ui-label">
                                    New reading <span className="ui-help mt-0">Current: {nozzle.lastReading} {FUEL_UNIT[nozzle.fuelType]}</span>
                                  </label>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={adjustReading}
                                    onChange={(e) => setAdjustReading(e.target.value)}
                                    placeholder="New reading"
                                    className="text-sm"
                                  />
                                </div>
                              )}
                              {adjustType === 'RESET' && (
                                <div className="ui-reading-editor__section">
                                  <div className="ui-alert ui-alert-danger">
                                    <p className="text-xs text-red-700">
                                      This will reset the meter on nozzle #{nozzle.nozzleNumber} to <strong>0.000</strong>. This action is logged and cannot be undone.
                                    </p>
                                  </div>
                                </div>
                              )}
                              <div className="ui-reading-editor__section">
                                <label className="ui-label">Reason <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={adjustReason}
                                  onChange={(e) => setAdjustReason(e.target.value)}
                                  placeholder="e.g. Meter replaced after malfunction"
                                  className="text-sm"
                                />
                                <p className="ui-help">This note is stored with the adjustment log for audit history.</p>
                              </div>
                              {adjustError && <p className="ui-error-text">{adjustError}</p>}
                              <div className="ui-reading-editor__actions">
                                <button
                                  type="submit"
                                  disabled={recordAdjustmentMutation.isPending}
                                  className={`ui-btn ${adjustType === 'RESET' ? 'ui-btn-danger' : 'ui-btn-primary'}`}
                                >
                                  {recordAdjustmentMutation.isPending ? 'Saving…' : adjustType === 'RESET' ? 'Reset to Zero' : 'Save Reading'}
                                </button>
                                <button type="button" onClick={() => setOpenPanel(null)} className="ui-btn ui-btn-secondary">
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        )}

                        {/* Record Dip panel */}
                        {isOpen(nozzle.id, 'dip') && (() => {
                          const priceEntry = currentPrices.find((p) => p.fuelType === nozzle.fuelType)
                          const pricePerUnit = priceEntry?.pricePerUnit ?? 0
                          const estimatedLoss = dipLitres && Number(dipLitres) > 0 && pricePerUnit > 0
                            ? Number(dipLitres) * pricePerUnit
                            : null
                          return (
                            <div className="px-4 py-3 border-t border-slate-100">
                              <form onSubmit={(e) => submitDip(e, nozzle)} className="ui-dip-editor">
                                <div className="ui-dip-editor__hero">
                                  <div>
                                    <p className="ui-section-kicker mb-2">Dip Record</p>
                                    <h5 className="ui-title-sm">Record fuel dip</h5>
                                    <p className="ui-subtitle mt-1">
                                      Record fuel physically removed from the tank, such as maintenance draining or contamination removal.
                                    </p>
                                  </div>
                                  <div className="ui-dip-editor__meta">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FUEL_COLOR[nozzle.fuelType] ?? ''}`}>
                                      {FUEL_LABEL[nozzle.fuelType]}
                                    </span>
                                  </div>
                                </div>
                                <div className="ui-dip-editor__section">
                                  <label className="ui-label">Litres Removed</label>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={dipLitres}
                                    onChange={(e) => setDipLitres(e.target.value)}
                                    placeholder="e.g. 12.500"
                                    className="text-xs min-h-10"
                                  />
                                  {estimatedLoss !== null && (
                                    <p className="ui-dip-editor__loss">
                                      Estimated loss: ₹{estimatedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      {` @ ₹${pricePerUnit}/unit`}
                                    </p>
                                  )}
                                </div>
                                <div className="ui-dip-editor__grid">
                                  <div className="ui-dip-editor__section">
                                    <label className="ui-label">
                                      Date <span className="text-slate-400">(leave blank for today)</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={dipDate}
                                      onChange={(e) => setDipDate(e.target.value)}
                                      className="text-xs min-h-10"
                                    />
                                  </div>
                                  <div className="ui-dip-editor__section">
                                    <label className="ui-label">Reason <span className="text-red-500">*</span></label>
                                    <input
                                      type="text"
                                      value={dipReason}
                                      onChange={(e) => setDipReason(e.target.value)}
                                      placeholder="e.g. Water contamination draining"
                                      className="text-xs min-h-10"
                                    />
                                  </div>
                                </div>
                                {dipError && <p className="ui-error-text">{dipError}</p>}
                                <div className="ui-dip-editor__actions">
                                  <button
                                    type="submit"
                                    disabled={recordDipMutation.isPending}
                                    className="ui-btn ui-btn-warning"
                                  >
                                    {recordDipMutation.isPending ? 'Recording…' : 'Record Dip'}
                                  </button>
                                  <button type="button" onClick={() => setOpenPanel(null)} className="ui-btn ui-btn-secondary">
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>

                {/* Inline add-nozzle form */}
                {addNozzleDuId === du.id && (
                  <div className="px-4 py-3 border-t border-blue-100 bg-blue-50/40 rounded-b-xl">
                    <form onSubmit={(e) => submitInlineNozzle(e, du)} className="flex items-end gap-2 flex-wrap">
                      <div className="w-20">
                        <label className="ui-label mb-1 text-[10px]">Nozzle #</label>
                        <input
                          type="number" min="1" max="9"
                          value={inlineNozzleNumber}
                          onChange={(e) => setInlineNozzleNumber(e.target.value)}
                          className="text-xs w-full"
                          placeholder="1"
                        />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="ui-label mb-1 text-[10px]">Fuel Type</label>
                        <SearchableSelect
                          value={inlineFuelType}
                          onChange={(v) => setInlineFuelType(v as FuelType)}
                          placeholder="— select —"
                          size="sm"
                          options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: FUEL_LABEL[ft] }))}
                        />
                      </div>
                      <div className="w-32">
                        <label className="ui-label mb-1 text-[10px]">Start Reading</label>
                        <input
                          type="number" step="0.001" min="0"
                          value={inlineReading}
                          onChange={(e) => setInlineReading(e.target.value)}
                          placeholder="0"
                          className="text-xs w-full"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addNozzleMutation.isPending}
                        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs"
                      >
                        {addNozzleMutation.isPending ? 'Adding…' : 'Add'}
                      </button>
                    </form>
                    {inlineError && <p className="ui-error-text mt-2">{inlineError}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create DU form or max-reached notice */}
      {activeDUCount >= pump.maxDuCount ? (
        <div className="space-y-2">
          <p className="ui-alert ui-alert-warning text-xs">
            Maximum DU count ({pump.maxDuCount}) reached.
            {' '}If you have added a new machine, you can increase the limit below.
          </p>
          {!showIncreaseMax ? (
            <button
              type="button"
              onClick={() => { setShowIncreaseMax(true); setNewMaxCount(String(pump.maxDuCount + 1)) }}
              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
            >
              + Increase DU limit
            </button>
          ) : (
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="ui-label">New maximum DU count</label>
                <input
                  type="number"
                  min={pump.maxDuCount + 1}
                  max="20"
                  value={newMaxCount}
                  onChange={(e) => setNewMaxCount(e.target.value)}
                  className="w-24 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => increaseMaxMutation.mutate(Number(newMaxCount))}
                disabled={increaseMaxMutation.isPending || !newMaxCount}
                className="ui-btn ui-btn-primary"
              >
                {increaseMaxMutation.isPending ? 'Saving…' : 'Increase Limit'}
              </button>
              <button
                type="button"
                onClick={() => { setShowIncreaseMax(false); setIncreaseError(null) }}
                className="ui-btn ui-btn-ghost text-xs"
              >
                Cancel
              </button>
              {increaseError && <p className="ui-error-text w-full">{increaseError}</p>}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submitAdd} className="ui-nozzle-form">
          <div className="ui-nozzle-form__hero">
            <div>
              <p className="ui-section-kicker mb-2">DU Setup</p>
              <h4 className="ui-title-sm">Add a new Dispensary Unit</h4>
              <p className="ui-subtitle mt-1">
                A Dispensary Unit (DU) is a physical MPD machine. Give it a name and add one or more nozzles — each nozzle carries exactly one fuel type.
              </p>
            </div>
          </div>

          <div className="ui-nozzle-form__section">
            <label className="ui-label">DU Name <span className="text-red-500">*</span></label>
            <input
              required
              type="text"
              value={duName}
              onChange={(e) => setDuName(e.target.value)}
              placeholder="e.g. DU-1, Machine A"
              className="text-sm"
            />
          </div>

          <div className="ui-nozzle-form__section">
            <div className="ui-nozzle-form__section-head">
              <div>
                <label className="ui-label mb-1">Nozzles</label>
                <p className="ui-help mt-0">Each nozzle has a unique number and exactly one fuel type.</p>
              </div>
              <button
                type="button"
                onClick={() => setDuNozzles((prev) => [...prev, { nozzleNumber: String(prev.length + 1), fuelType: '', initialReading: '' }])}
                className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-blue-600"
              >
                + Add nozzle
              </button>
            </div>

            <div className="space-y-2 mt-2">
              {duNozzles.map((row, idx) => (
                <div key={idx} className="flex items-end gap-2 flex-wrap">
                  <div className="w-20">
                    <label className="ui-label mb-1 text-[10px]">Nozzle #</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={row.nozzleNumber}
                      onChange={(e) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, nozzleNumber: e.target.value } : r))}
                      className="text-xs w-full"
                      placeholder="1"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="ui-label mb-1 text-[10px]">Fuel Type</label>
                    <SearchableSelect
                      value={row.fuelType}
                      onChange={(v) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, fuelType: v as FuelType } : r))}
                      placeholder="— select —"
                      size="sm"
                      options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: FUEL_LABEL[ft] }))}
                    />
                  </div>
                  <div className="w-32">
                    <label className="ui-label mb-1 text-[10px]">Start Reading</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.initialReading}
                      onChange={(e) => setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, initialReading: e.target.value } : r))}
                      placeholder="0"
                      className="text-xs w-full"
                    />
                  </div>
                  {duNozzles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDuNozzles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-500 hover:text-red-700 pb-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {addError && <p className="ui-error-text">{addError}</p>}

          <div className="ui-nozzle-form__actions">
            <button type="submit" disabled={createDUMutation.isPending} className="ui-btn ui-btn-primary">
              {createDUMutation.isPending ? 'Creating…' : 'Create DU'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Fuel prices content ───────────────────────────────────────────────────────

function FuelPricesContent({ pump, currentPrices }: { pump: PumpSummary; currentPrices: any[] }) {
  const queryClient = useQueryClient()
  // Dynamic price inputs keyed by fuel type (only for fuel types actually present on this pump)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  // 15% deviation warning state — set when backend returns HTTP 409
  const [deviationWarning, setDeviationWarning] = useState<(PriceDeviationWarning & { fuelType: string }) | null>(null)
  // P2.3 — open shifts warning shown after a successful price update
  const [openShiftsWarning, setOpenShiftsWarning] = useState<string | null>(null)

  // Derive the unique fuel types across all DU nozzles
  const availableFuelTypes = [...new Set(
    pump.dus.flatMap((d) => d.nozzles.map((n) => n.fuelType))
  )] as FuelType[]

  const mutation = useMutation({
    mutationFn: pumpApi.setFuelPrice,
    onError: (err: any) => {
      if (err?.response?.status === 409 && err?.response?.data?.deviationPercent != null) {
        // Backend returned a PriceDeviationWarning (has deviationPercent) — show confirmation dialog
        const warning = err.response.data as PriceDeviationWarning
        // Determine which fuel type triggered the warning
        const ft = availableFuelTypes.find((f) => prices[f] && Number(prices[f]) > 0) ?? ''
        setDeviationWarning({ ...warning, fuelType: ft })
      } else {
        // 409 from a DB constraint violation, or any other error — show the message directly
        setError(err?.response?.data?.message ?? 'Failed to set price')
      }
    },
  })

  const getCurrentPrice = (fuelType: string) =>
    currentPrices.find((p) => p.fuelType === fuelType)?.pricePerUnit

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSuccess(false); setDeviationWarning(null); setOpenShiftsWarning(null)
    const tasks = availableFuelTypes
      .filter((ft) => prices[ft] && Number(prices[ft]) > 0)
      .map((ft) => mutation.mutateAsync({ pumpId: pump.id, fuelType: ft, pricePerUnit: Number(prices[ft]) }))
    if (tasks.length === 0) { setError('Enter at least one price to save.'); return }
    try {
      const results = await Promise.all(tasks)
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPrices({})
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      // Show open-shifts warning if any price update detected open shifts
      const warning = results.find((r) => r.openShiftsWarning)?.openShiftsWarning ?? null
      setOpenShiftsWarning(warning)
    } catch { /* error already set by onError */ }
  }

  const confirmDeviation = async () => {
    if (!deviationWarning) return
    setDeviationWarning(null); setError(null)
    try {
      const result = await mutation.mutateAsync({
        pumpId: pump.id,
        fuelType: deviationWarning.fuelType as FuelType,
        pricePerUnit: deviationWarning.newPrice,
        confirmed: true,
      })
      queryClient.invalidateQueries({ queryKey: ['fuelPrices', pump.id] })
      setPrices({})
      setSuccess(true); setTimeout(() => setSuccess(false), 3000)
      if (result.openShiftsWarning) setOpenShiftsWarning(result.openShiftsWarning)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to set price')
    }
  }

  const todayStr = localDateInputValue()
  const pricesStale = currentPrices.length > 0 && currentPrices.some((p) => p.effectiveFrom < todayStr)

  if (pump.dus.length === 0) {
    return <p className="text-xs text-slate-400">Add at least one DU with a nozzle first (Nozzles section above).</p>
  }

  return (
    <div className="space-y-3">
      {/* Stale price alert — shown when no price has been set today */}
      {pricesStale && (() => {
        const lastUpdatedOn = currentPrices.reduce((latest, p) =>
          p.effectiveFrom > latest ? p.effectiveFrom : latest, currentPrices[0].effectiveFrom)
        return (
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-300 rounded-lg px-4 py-3">
            <span className="text-red-500 mt-0.5 text-base leading-none">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-700">Fuel prices not updated today</p>
              <p className="text-xs text-red-500 mt-0.5">
                Last updated on{' '}
                <span className="font-medium">
                  {formatIstDate(lastUpdatedOn)}
                </span>
                . Please enter today's prices below.
              </p>
            </div>
          </div>
        )
      })()}

      {/* Current prices summary */}
      {currentPrices.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {currentPrices.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-emerald-700">{FUEL_LABEL[p.fuelType] ?? p.fuelType}</span>
              <span className="text-sm font-bold text-emerald-800">
                ₹{p.pricePerUnit}/{FUEL_UNIT[p.fuelType] ?? 'L'}
              </span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {availableFuelTypes.map((ft) => (
            <div key={ft}>
              <label className="ui-label">
                {FUEL_LABEL[ft]} (₹/{FUEL_UNIT[ft]})
                {getCurrentPrice(ft) != null && (
                  <span className="text-slate-400 ml-1">current: ₹{getCurrentPrice(ft)}</span>
                )}
              </label>
              <input type="number" step="0.01" min="0.01"
                value={prices[ft] ?? ''}
                onChange={(e) => setPrices((prev) => ({ ...prev, [ft]: e.target.value }))}
                className="w-32 text-sm"
                placeholder="e.g. 96.72" />
            </div>
          ))}
          <button type="submit" disabled={mutation.isPending}
            className="ui-btn ui-btn-primary disabled:bg-emerald-300">
            {mutation.isPending ? 'Saving...' : 'Save Prices'}
          </button>
        </div>
        {error   && <p className="ui-error-text">{error}</p>}
        {success && <p className="text-emerald-600 text-xs">Prices saved successfully.</p>}
      </form>

      {/* P2.3 — Open-shifts warning after price change */}
      {openShiftsWarning && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
          <span className="text-amber-500 mt-0.5 text-base leading-none shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Open Shifts Detected</p>
            <p className="text-xs text-amber-700 mt-0.5">{openShiftsWarning}</p>
          </div>
          <button onClick={() => setOpenShiftsWarning(null)} className="text-amber-400 hover:text-amber-600 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {/* 15% deviation confirmation dialog */}
      {deviationWarning && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal-panel w-full max-w-sm">
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
              <div className="ui-modal-heading flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-amber-600 text-base">⚠</span>
                </div>
                <div>
                  <p className="ui-modal-title">Large Price Change Detected</p>
                  <p className="ui-modal-subtitle">{deviationWarning.message}</p>
                </div>
              </div>
              <button onClick={() => setDeviationWarning(null)} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
            </div>
            <div className="ui-modal-body space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Last price</span>
                <span className="font-semibold text-slate-700">₹{deviationWarning.lastPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">New price</span>
                <span className="font-semibold text-slate-700">₹{deviationWarning.newPrice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deviation</span>
                <span className="font-bold text-amber-700">{deviationWarning.deviationPercent.toFixed(1)}%</span>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Are you sure you want to set this price? This is a significant deviation from the last recorded price.
            </p>
            </div>
            <div className="ui-modal-footer -mx-6 -mb-6">
              <button
                onClick={() => setDeviationWarning(null)}
                className="ui-btn ui-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeviation}
                className="ui-btn flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              >
                Yes, Set Price
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Staff content ─────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  OPERATOR:   'bg-green-100 text-green-700',
  MANAGER:    'bg-blue-100 text-blue-700',
  ADMIN:      'bg-purple-100 text-purple-700',
  ACCOUNTANT: 'bg-orange-100 text-orange-700',
}

type StaffCreateForm = Omit<CreateUserRequest, 'assignedPumpId' | 'gender'> & {
  gender: UserGender | ''
}

const EMPTY_FORM: StaffCreateForm = {
  fullName: '',
  phoneNumber: '',
  password: '',
  gender: '',
  nightShiftConsent: false,
  role: 'OPERATOR' as const,
}

function StaffContent({ pump }: { pump: PumpSummary }) {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const isOwner = currentUser?.role === 'OWNER'

  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Preferences / leave / pay-rates panel — only one staff member open at a time
  type StaffPanel = 'preferences' | 'leave' | 'rates'
  const [openStaffPanel, setOpenStaffPanel] = useState<{ userId: number; panel: StaffPanel } | null>(null)
  const [openStaffMenu, setOpenStaffMenu] = useState<number | null>(null)
  const [prefShiftDefId, setPrefShiftDefId] = useState<number | null>(null)
  const [prefDayOff, setPrefDayOff] = useState<PreferredDayOff | ''>('')
  const [prefError, setPrefError] = useState<string | null>(null)
  const [newLeaveDate, setNewLeaveDate] = useState('')
  const [newLeaveReason, setNewLeaveReason] = useState('')
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // Pay rates panel state
  const [rateShift1, setRateShift1]       = useState('')
  const [rateStandard, setRateStandard]   = useState('')
  const [rateDaily, setRateDaily]         = useState('')
  const [rateError, setRateError]         = useState<string | null>(null)

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff', pump.id],
    queryFn:  () => userApi.getStaff(pump.id),
  })

  const mutation = useMutation({
    mutationFn: (req: CreateUserRequest) => userApi.createUser(req),
    onSuccess: () => {
      setForm(EMPTY_FORM); setError(null); setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      queryClient.invalidateQueries({ queryKey: ['staff', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['operators', pump.id] })
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Failed to create user'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      userApi.updateUserStatus(userId, status),
    onSuccess: () => {
      setStatusError(null)
      queryClient.invalidateQueries({ queryKey: ['staff', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['operators', pump.id] })
    },
    onError: (err: any) => setStatusError(err?.response?.data?.message ?? 'Failed to update status'),
  })

  const { data: activeShiftDefs = [] } = useQuery({
    queryKey: ['shift-definitions-active', pump.id],
    queryFn: () => shiftDefinitionApi.getActive(pump.id),
  })

  // Fetch preference for the currently-open staff member
  const { data: openPref } = useQuery({
    queryKey: ['staffPref', pump.id, openStaffPanel?.userId],
    queryFn: () => shiftPlanApi.getPreference(pump.id, openStaffPanel!.userId),
    enabled: !!openStaffPanel,
  })

  // Fetch leaves for the currently-open staff member
  const { data: openLeaves = [] } = useQuery({
    queryKey: ['staffLeaves', pump.id, openStaffPanel?.userId],
    queryFn: () => shiftPlanApi.getLeaves(pump.id, openStaffPanel!.userId),
    enabled: !!openStaffPanel && openStaffPanel.panel === 'leave',
  })

  const prefMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      shiftPlanApi.setPreference(pump.id, userId, prefShiftDefId, prefDayOff || null),
    onSuccess: () => {
      setPrefError(null)
      queryClient.invalidateQueries({ queryKey: ['staffPref', pump.id, openStaffPanel?.userId] })
    },
    onError: (err: any) => setPrefError(err?.response?.data?.message ?? 'Failed to save preferences'),
  })

  const addLeaveMutation = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      shiftPlanApi.addLeave(pump.id, userId, newLeaveDate, newLeaveReason || undefined),
    onSuccess: () => {
      setNewLeaveDate(''); setNewLeaveReason(''); setLeaveError(null)
      queryClient.invalidateQueries({ queryKey: ['staffLeaves', pump.id, openStaffPanel?.userId] })
    },
    onError: (err: any) => setLeaveError(err?.response?.data?.message ?? 'Failed to add leave'),
  })

  const removeLeaveMutation = useMutation({
    mutationFn: ({ leaveId }: { leaveId: number }) =>
      shiftPlanApi.removeLeave(pump.id, openStaffPanel!.userId, leaveId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['staffLeaves', pump.id, openStaffPanel?.userId] }),
  })

  const rateMutation = useMutation({
    mutationFn: ({ userId, shift1HourlyRate, standardHourlyRate, dailyRate }: { userId: number; shift1HourlyRate?: number; standardHourlyRate?: number; dailyRate?: number }) =>
      userApi.updatePayRates(userId, { shift1HourlyRate, standardHourlyRate, dailyRate }),
    onSuccess: () => {
      setRateError(null)
      setOpenStaffPanel(null)
      queryClient.invalidateQueries({ queryKey: ['staff', pump.id] })
    },
    onError: (err: any) => setRateError(err?.response?.data?.message ?? 'Failed to save rates'),
  })

  const openPanel = (userId: number, panel: StaffPanel, pref?: typeof openPref, member?: StaffMember) => {
    setOpenStaffMenu(null)
    setOpenStaffPanel(prev => prev?.userId === userId && prev?.panel === panel ? null : { userId, panel })
    setPrefError(null); setLeaveError(null); setRateError(null)
    if (panel === 'preferences' && pref) {
      setPrefShiftDefId(pref.preferredShiftDefinitionId ?? null)
      setPrefDayOff(pref.preferredDayOff ?? '')
    }
    if (panel === 'rates' && member) {
      setRateShift1(member.shift1HourlyRate != null ? String(member.shift1HourlyRate) : '')
      setRateStandard(member.standardHourlyRate != null ? String(member.standardHourlyRate) : '')
      setRateDaily(member.dailyRate != null ? String(member.dailyRate) : '')
    }
  }

  const set = <K extends keyof StaffCreateForm>(field: K, value: StaffCreateForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    if (!form.gender) {
      setError('Gender is required')
      return
    }
    mutation.mutate({
      ...form,
      gender: form.gender,
      nightShiftConsent: form.role === 'OPERATOR' && form.gender === 'FEMALE' ? form.nightShiftConsent : false,
      assignedPumpId: pump.id,
    })
  }

  return (
    <div className="space-y-4">

      {/* Staff list */}
      {!isLoading && staff.length > 0 && (
        <div className="space-y-2">
          {statusError && <p className="ui-error-text">{statusError}</p>}
          {staff.map((member: StaffMember) => {
            const isInactive = member.status === 'INACTIVE'
            const isPrefOpen  = openStaffPanel?.userId === member.id && openStaffPanel?.panel === 'preferences'
            const isLeaveOpen = openStaffPanel?.userId === member.id && openStaffPanel?.panel === 'leave'
            const isOperator  = member.role === 'OPERATOR'
            return (
              <div
                key={member.id}
                className={`ui-card-plain relative ${openStaffMenu === member.id ? 'z-20' : 'z-0'} ${isInactive ? 'border-slate-100 opacity-70' : 'border-slate-200'}`}
              >
                {/* Staff row */}
                <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                  <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                    ROLE_BADGE[member.role]?.replace('text-', 'bg-').replace('-700', '-200') ?? 'bg-slate-100'
                  }`}>
                    {member.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-slate-800">{member.fullName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                          <span>{member.phoneNumber}</span>
                          {member.employeeId ? <span>{member.employeeId}</span> : null}
                          {member.gender ? (
                            <span>{member.gender.charAt(0) + member.gender.slice(1).toLowerCase()}</span>
                          ) : null}
                          {member.role === 'OPERATOR' && member.gender === 'FEMALE' ? (
                            <span className={member.nightShiftConsent ? 'text-emerald-600' : 'text-amber-700'}>
                              {member.nightShiftConsent ? 'Night shift okay' : 'No night shift'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-[0.08em] ${ROLE_BADGE[member.role] ?? 'bg-slate-100 text-slate-600'}`}>
                          {member.role}
                        </span>
                        {isInactive && (
                          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-[0.08em] bg-red-100 text-red-600">Inactive</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="md:ml-auto">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenStaffMenu(openStaffMenu === member.id ? null : member.id)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg leading-none text-slate-400 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-600"
                          title="Staff actions"
                        >
                          ⋮
                        </button>
                        {openStaffMenu === member.id && (
                          <>
                            <div
                              className="fixed inset-0 z-[5]"
                              onClick={() => setOpenStaffMenu(null)}
                            />
                            <div className="absolute right-0 top-full z-[6] mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur">
                              {isOperator && (
                                <button
                                  type="button"
                                  onClick={() => openPanel(member.id, 'preferences')}
                                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                    isPrefOpen ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                                  }`}
                                >
                                  <span className="mt-0.5 shrink-0 text-sm leading-none">⚙</span>
                                  <span className="min-w-0">
                                    <span className="block text-xs font-semibold leading-5">Shift Preferences</span>
                                    <span className="block text-[11px] leading-4 text-slate-400">Set preferred shift and weekly day off</span>
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openPanel(member.id, 'leave')}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                  isLeaveOpen ? 'bg-amber-50 text-amber-700' : 'text-slate-700 hover:bg-amber-50 hover:text-amber-700'
                                }`}
                              >
                                <span className="mt-0.5 shrink-0 text-sm leading-none">📅</span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold leading-5">Manage Leave</span>
                                  <span className="block text-[11px] leading-4 text-slate-400">Add or remove leave dates for this staff member</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openPanel(member.id, 'rates', undefined, member)}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                  openStaffPanel?.userId === member.id && openStaffPanel?.panel === 'rates'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                                }`}
                              >
                                <span className="mt-0.5 shrink-0 text-sm leading-none">₹</span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold leading-5">
                                    Pay Rates{(member.role === 'OPERATOR' ? member.shift1HourlyRate == null : member.dailyRate == null) ? (
                                      <span className="ml-1 text-red-400">!</span>
                                    ) : null}
                                  </span>
                                  <span className="block text-[11px] leading-4 text-slate-400">Configure hourly or daily pay rates</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenStaffMenu(null)
                                  statusMutation.mutate({ userId: member.id, status: isInactive ? 'ACTIVE' : 'INACTIVE' })
                                }}
                                disabled={statusMutation.isPending}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                                  isInactive ? 'text-emerald-700 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'
                                }`}
                              >
                                <span className="mt-0.5 shrink-0 text-sm leading-none">{isInactive ? '↺' : '⛔'}</span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold leading-5">{isInactive ? 'Activate Staff' : 'Deactivate Staff'}</span>
                                  <span className="block text-[11px] leading-4 text-slate-400">
                                    {isInactive ? 'Allow this staff member to work again' : 'Temporarily remove this staff member from active use'}
                                  </span>
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Preferences panel */}
                {isPrefOpen && (
                  <div className="px-3 py-3 border-t border-slate-100">
                    <div className="max-w-sm space-y-3">
                      <p className="text-xs font-semibold text-slate-700">Shift preferences for {member.fullName}</p>
                      <div>
                        <label className="ui-label">Preferred shift</label>
                        <SearchableSelect
                          value={isPrefOpen
                            ? (prefShiftDefId !== null ? String(prefShiftDefId) : '')
                            : (openPref?.preferredShiftDefinitionId !== null && openPref?.preferredShiftDefinitionId !== undefined ? String(openPref.preferredShiftDefinitionId) : '')}
                          onChange={v => setPrefShiftDefId(v ? Number(v) : null)}
                          placeholder="Any shift"
                          size="sm"
                          options={activeShiftDefs.map(d => ({ value: String(d.id), label: `${d.name} · ${d.windowLabel}` }))}
                        />
                      </div>
                      <div>
                        <label className="ui-label">Preferred day off</label>
                        <SearchableSelect
                          value={isPrefOpen ? prefDayOff : (openPref?.preferredDayOff ?? '')}
                          onChange={v => setPrefDayOff(v as PreferredDayOff | '')}
                          placeholder="No preference"
                          size="sm"
                          options={Object.entries(DAY_LABELS).map(([val, label]) => ({ value: val, label }))}
                        />
                      </div>
                      {prefError && <p className="ui-error-text">{prefError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => prefMutation.mutate({ userId: member.id })}
                          disabled={prefMutation.isPending}
                          className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs"
                        >
                          {prefMutation.isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setOpenStaffPanel(null)}
                          className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pay Rates panel */}
                {openStaffPanel?.userId === member.id && openStaffPanel?.panel === 'rates' && (
                  <div className="px-3 py-3 border-t border-slate-100">
                    <div className="max-w-sm space-y-3">
                      {member.role === 'OPERATOR' ? (
                        <>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">Hourly pay rates for {member.fullName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Shift 1 (12 AM–8 AM) = night rate · Shift 2 &amp; 3 (8 AM–12 AM) = standard rate
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="ui-label">
                                Night rate (₹/hr) <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                                <input type="number" min="1" step="0.01" value={rateShift1}
                                  onChange={e => setRateShift1(e.target.value)} placeholder="e.g. 60"
                                  className="w-full pl-5 pr-2 text-xs min-h-10" />
                              </div>
                            </div>
                            <div>
                              <label className="ui-label">
                                Day rate (₹/hr) <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                                <input type="number" min="1" step="0.01" value={rateStandard}
                                  onChange={e => setRateStandard(e.target.value)} placeholder="e.g. 45"
                                  className="w-full pl-5 pr-2 text-xs min-h-10" />
                              </div>
                            </div>
                          </div>
                          {rateError && <p className="ui-error-text">{rateError}</p>}
                          <div className="flex gap-2">
                            <button type="button"
                              disabled={!rateShift1 || !rateStandard || rateMutation.isPending}
                              onClick={() => rateMutation.mutate({ userId: member.id, shift1HourlyRate: parseFloat(rateShift1), standardHourlyRate: parseFloat(rateStandard) })}
                              className="ui-btn min-h-0 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                              {rateMutation.isPending ? 'Saving…' : 'Save Rates'}
                            </button>
                            <button type="button" onClick={() => setOpenStaffPanel(null)}
                              className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">Daily pay rate for {member.fullName}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Paid per working day · leave days are deducted automatically
                            </p>
                          </div>
                          <div>
                            <label className="ui-label">
                              Daily rate (₹/day) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative max-w-[160px]">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                              <input type="number" min="1" step="0.01" value={rateDaily}
                                onChange={e => setRateDaily(e.target.value)} placeholder="e.g. 800"
                                className="w-full pl-5 pr-2 text-xs min-h-10" />
                            </div>
                          </div>
                          {rateError && <p className="ui-error-text">{rateError}</p>}
                          <div className="flex gap-2">
                            <button type="button"
                              disabled={!rateDaily || rateMutation.isPending}
                              onClick={() => rateMutation.mutate({ userId: member.id, dailyRate: parseFloat(rateDaily) })}
                              className="ui-btn min-h-0 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
                              {rateMutation.isPending ? 'Saving…' : 'Save Rate'}
                            </button>
                            <button type="button" onClick={() => setOpenStaffPanel(null)}
                              className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">Cancel</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Leave management panel */}
                {isLeaveOpen && (
                  <div className="px-3 py-3 border-t border-slate-100">
                    <div className="max-w-sm space-y-3">
                      <p className="text-xs font-semibold text-slate-700">Leave dates for {member.fullName}</p>
                      {openLeaves.length === 0 ? (
                        <p className="text-xs text-slate-400">No leave dates recorded.</p>
                      ) : (
                        <div className="space-y-1">
                          {openLeaves.map(lv => (
                            <div key={lv.id} className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-700">
                                {formatIstDate(lv.leaveDate)}
                              </span>
                              {lv.reason && <span className="text-xs text-slate-400">— {lv.reason}</span>}
                              <button
                                type="button"
                                onClick={() => removeLeaveMutation.mutate({ leaveId: lv.id })}
                                disabled={removeLeaveMutation.isPending}
                                className="ui-btn ui-btn-ghost min-h-0 ml-auto px-0 py-0 text-xs font-bold text-slate-300 hover:text-red-500 disabled:opacity-40"
                                title="Remove leave"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Add new leave */}
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <p className="ui-label mb-0">Add leave date</p>
                        <input
                          type="date"
                          value={newLeaveDate}
                          onChange={e => setNewLeaveDate(e.target.value)}
                          className="text-xs min-h-10"
                        />
                        <input
                          type="text"
                          placeholder="Reason (optional)"
                          value={newLeaveReason}
                          onChange={e => setNewLeaveReason(e.target.value)}
                          className="text-xs min-h-10"
                        />
                        {leaveError && <p className="ui-error-text">{leaveError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!newLeaveDate || addLeaveMutation.isPending}
                            onClick={() => addLeaveMutation.mutate({ userId: member.id })}
                            className="ui-btn min-h-0 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white"
                          >
                            {addLeaveMutation.isPending ? 'Adding…' : 'Add Leave'}
                          </button>
                          <button type="button" onClick={() => setOpenStaffPanel(null)}
                            className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add staff form */}
      <div className="border-t border-slate-200 pt-5">
        <div className="ui-card-plain ui-card-muted p-4 md:p-5">
          <div className="flex flex-col gap-1 border-b border-slate-200/80 pb-3">
            <p className="ui-label mb-0 tracking-[0.14em] uppercase text-slate-500">Add a new staff member</p>
            <p className="text-sm text-slate-500">
              Capture staff details once here so planning and permissions can use the correct profile.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4 pt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="ui-label">Full Name</label>
                    <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
                      placeholder="e.g. Raju Kumar"
                      className="text-sm" />
                  </div>
                  <div>
                    <label className="ui-label">Phone Number</label>
                    <input required value={form.phoneNumber} onChange={(e) => set('phoneNumber', e.target.value)}
                      placeholder="10-digit number" maxLength={10}
                      className="text-sm" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="ui-label">Password</label>
                    <input required type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
                      placeholder="Min 6 characters"
                      className="text-sm" />
                    <p className="ui-help">Use a temporary password the staff member can reset later.</p>
                  </div>
                  <div>
                    <label className="ui-label">Gender</label>
                    <SearchableSelect
                      value={form.gender}
                      onChange={v => setForm(prev => ({
                        ...prev,
                        gender: v as UserGender,
                        nightShiftConsent: prev.role === 'OPERATOR' && v === 'FEMALE' ? prev.nightShiftConsent : false,
                      }))}
                      placeholder="Select gender"
                      options={[
                        { value: 'MALE', label: 'Male' },
                        { value: 'FEMALE', label: 'Female' },
                        { value: 'OTHER', label: 'Other' },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="ui-card-plain bg-white border-slate-200 p-4 space-y-3">
                <div>
                  <p className="ui-label mb-0">Role & shift rules</p>
                  <p className="ui-help">Choose the staff role first. Extra planning rules appear only when needed.</p>
                </div>

                <div>
                  <label className="ui-label">Role</label>
                  <SearchableSelect
                    value={form.role}
                    onChange={v => setForm(prev => ({
                      ...prev,
                      role: v as 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'ACCOUNTANT',
                      nightShiftConsent: v === 'OPERATOR' && prev.gender === 'FEMALE' ? prev.nightShiftConsent : false,
                    }))}
                    options={[
                      { value: 'OPERATOR',   label: 'Operator' },
                      { value: 'MANAGER',    label: 'Manager' },
                      { value: 'ADMIN',      label: 'Admin' },
                      { value: 'ACCOUNTANT', label: 'Accountant' },
                    ]}
                  />
                </div>

                {form.role === 'OPERATOR' && form.gender === 'FEMALE' ? (
                  <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-3.5 py-3">
                    <input
                      type="checkbox"
                      checked={!!form.nightShiftConsent}
                      onChange={(e) => set('nightShiftConsent', e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-amber-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-amber-900">Okay for night shift</span>
                      <span className="mt-1 block text-xs leading-5 text-amber-800">
                        If left unchecked, shift planning will skip night-shift assignment for this operator.
                      </span>
                    </span>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3.5 py-3">
                    <p className="text-sm font-medium text-slate-700">Night-shift consent</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      This appears only for female operators because it affects night-shift assignment in planning.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-[20px]">
                {error && <p className="ui-error-text mt-0">{error}</p>}
                {success && <p className="text-xs text-emerald-600">Staff member added successfully.</p>}
              </div>

              <button type="submit" disabled={mutation.isPending}
                className="ui-btn ui-btn-primary self-start sm:self-auto">
                {mutation.isPending ? 'Adding...' : 'Add Staff Member'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Tanks content ─────────────────────────────────────────────────────────────
// Owner manually creates each underground tank (name, fuel type, capacity).
// Multiple tanks per fuel type are supported (e.g. 3 petrol tanks).

function TanksContent({ pump }: { pump: PumpSummary }) {
  const queryClient = useQueryClient()

  // Create form state
  const [createIdentifier, setCreateIdentifier] = useState('')
  const [createFuelType, setCreateFuelType]     = useState<FuelType>('PETROL')
  const [createCapacity, setCreateCapacity]     = useState('')
  const [createDipTol, setCreateDipTol]         = useState('')
  const [createError, setCreateError]           = useState<string | null>(null)

  // Fuel type dropdown open/close
  const [fuelDropdownOpen, setFuelDropdownOpen] = useState(false)
  const fuelDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fuelDropdownRef.current && !fuelDropdownRef.current.contains(e.target as Node)) {
        setFuelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Edit form state
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editCapacity, setEditCapacity]   = useState('')
  const [editIdentifier, setEditIdentifier] = useState('')
  const [editError, setEditError]         = useState<string | null>(null)

  // Disable confirmation: null = no confirm shown; tankId = confirm dialog for that tank
  const [confirmDisableId, setConfirmDisableId] = useState<number | null>(null)
  const [statusError, setStatusError]           = useState<string | null>(null)

  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ['tanks', pump.id],
    queryFn:  () => pumpApi.getTanks(pump.id),
  })

  const createMutation = useMutation({
    mutationFn: (req: { tankIdentifier: string; fuelType: FuelType; capacity: number; dipTolerance?: number }) =>
      pumpApi.createTank(pump.id, req),
    onSuccess: () => {
      setCreateIdentifier(''); setCreateCapacity(''); setCreateDipTol(''); setCreateError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err: any) => setCreateError(err?.response?.data?.message ?? 'Failed to create tank'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ tankId, req }: { tankId: number; req: any }) => pumpApi.updateTank(tankId, req),
    onSuccess: () => {
      setEditingId(null); setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err: any) => setEditError(err?.response?.data?.message ?? 'Failed to update tank'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ tankId, status }: { tankId: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      pumpApi.updateTankStatus(tankId, status),
    onSuccess: () => {
      setConfirmDisableId(null); setStatusError(null)
      queryClient.invalidateQueries({ queryKey: ['tanks', pump.id] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pump.id] })
    },
    onError: (err: any) => setStatusError(err?.response?.data?.message ?? 'Failed to update tank status'),
  })

  /** Returns true when currentStock > 5% of capacity (significant frozen stock warning). */
  const hasSignificantStock = (tank: TankInfo) =>
    tank.capacity > 0 && (tank.currentStock / tank.capacity) > 0.05

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(null)
    if (!createIdentifier.trim()) { setCreateError('Tank name is required.'); return }
    if (!createCapacity || Number(createCapacity) <= 0) { setCreateError('Capacity must be greater than 0.'); return }
    createMutation.mutate({
      tankIdentifier: createIdentifier.trim(),
      fuelType: createFuelType,
      capacity: Number(createCapacity),
      dipTolerance: createDipTol ? Number(createDipTol) : undefined,
    })
  }

  const submitEdit = (e: React.FormEvent, tank: TankInfo) => {
    e.preventDefault(); setEditError(null)
    if (!editCapacity || Number(editCapacity) <= 0) { setEditError('Capacity must be greater than 0.'); return }
    updateMutation.mutate({
      tankId: tank.id,
      req: { capacity: Number(editCapacity), tankIdentifier: editIdentifier.trim() || undefined },
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Add each underground tank manually. Multiple tanks per fuel type are allowed.
        Set capacity so that stock level bars and low-stock alerts work correctly.
      </p>

      {/* Existing tanks */}
      {isLoading ? (
        <p className="text-xs text-slate-400">Loading tanks...</p>
      ) : tanks.length === 0 ? (
        <p className="text-xs text-slate-400">No tanks yet. Add one below.</p>
      ) : (
        <div className="space-y-2">
          {statusError && (
            <div className="ui-alert ui-alert-danger text-sm">
              <p className="text-red-600 text-xs">{statusError}</p>
            </div>
          )}
          {(tanks as TankInfo[]).map((tank) => {
            const isInactive = tank.status === 'INACTIVE'
            return (
              <div key={tank.id} className={`border rounded-lg overflow-hidden transition-opacity ${
                isInactive ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
              }`}>
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      isInactive ? 'bg-slate-100 text-slate-400 border-slate-200' : (FUEL_COLOR[tank.fuelType] ?? 'bg-slate-100 text-slate-600 border-slate-200')
                    }`}>
                      {FUEL_LABEL[tank.fuelType] ?? tank.fuelType}
                    </span>
                    <span className={`text-sm font-semibold ${isInactive ? 'text-slate-400' : 'text-slate-700'}`}>
                      {tank.tankIdentifier}
                    </span>
                    {isInactive && (
                      <span className="text-xs bg-orange-100 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                        Disabled
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Capacity: <span className="text-slate-500 font-medium">
                        {Number(tank.capacity).toLocaleString('en-IN', { minimumFractionDigits: 0 })} {FUEL_UNIT[tank.fuelType] ?? 'L'}
                      </span>
                      {isInactive && (
                        <span className="ml-1 text-orange-500">(stock frozen)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {/* Edit is only available for active tanks */}
                    {!isInactive && (
                        <button type="button"
                          onClick={() => {
                            if (editingId === tank.id) { setEditingId(null) } else {
                              setEditingId(tank.id); setEditCapacity(String(tank.capacity))
                              setEditIdentifier(tank.tankIdentifier); setEditError(null)
                            }
                          }}
                          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
                          {editingId === tank.id ? 'Cancel' : 'Edit'}
                        </button>
                    )}

                    {/* Disable / Enable toggle */}
                    {confirmDisableId === tank.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-orange-600">
                          {hasSignificantStock(tank)
                            ? `${((tank.currentStock / tank.capacity) * 100).toFixed(0)}% stock will be frozen. Confirm?`
                            : 'Disable this tank?'}
                        </span>
                        <button
                          type="button"
                          onClick={() => statusMutation.mutate({ tankId: tank.id, status: 'INACTIVE' })}
                          disabled={statusMutation.isPending}
                          className="ui-btn min-h-0 px-2 py-1 text-xs bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white">
                          Yes
                        </button>
                        <button type="button" onClick={() => setConfirmDisableId(null)}
                          className="ui-btn ui-btn-secondary min-h-0 px-2 py-1 text-xs">
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setStatusError(null)
                          if (isInactive) {
                            statusMutation.mutate({ tankId: tank.id, status: 'ACTIVE' })
                          } else {
                            setConfirmDisableId(tank.id)
                          }
                        }}
                        disabled={statusMutation.isPending}
                        className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                          isInactive
                            ? 'text-emerald-600 hover:text-emerald-800'
                            : 'text-orange-500 hover:text-orange-700'
                        }`}>
                        {isInactive ? 'Enable' : 'Disable'}
                      </button>
                    )}
                  </div>
                </div>

                {editingId === tank.id && !isInactive && (
                  <form onSubmit={(e) => submitEdit(e, tank)}
                    className="px-3 py-3 border-t border-slate-100 bg-slate-50 space-y-2">
                    <div className="flex gap-3 items-end flex-wrap">
                      <div>
                        <label className="ui-label">
                          Capacity ({FUEL_UNIT[tank.fuelType] ?? 'L'})
                        </label>
                        <input type="number" step="0.001" min="1" value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)}
                          className="w-36 text-xs min-h-10"
                          placeholder="e.g. 25000" />
                      </div>
                      <div>
                        <label className="ui-label">Tank Name/ID</label>
                        <input type="text" value={editIdentifier}
                          onChange={(e) => setEditIdentifier(e.target.value)}
                          className="w-36 text-xs min-h-10"
                          placeholder="e.g. Petrol Tank 1" />
                      </div>
                      <button type="submit" disabled={updateMutation.isPending}
                        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {editError && <p className="ui-error-text">{editError}</p>}
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add tank form */}
      <div className={tanks.length > 0 ? 'border-t border-slate-200 pt-4' : ''}>
        <p className="ui-label mb-3">
          {tanks.length === 0 ? 'Add the first tank' : 'Add another tank'}
        </p>
        <form onSubmit={submitCreate} className="space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="ui-label">Tank Name/ID <span className="text-red-500">*</span></label>
              <input required type="text" value={createIdentifier}
                onChange={(e) => setCreateIdentifier(e.target.value)}
                placeholder="e.g. Petrol Tank 1"
                className="w-36 text-sm" />
            </div>
            <div className="relative" ref={fuelDropdownRef}>
              <label className="ui-label">Fuel Type <span className="text-red-500">*</span></label>
              <button
                type="button"
                onClick={() => setFuelDropdownOpen(o => !o)}
                className="ui-btn ui-btn-secondary min-w-[148px] justify-between bg-white text-sm"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${FUEL_COLOR[createFuelType]}`}>
                  {FUEL_LABEL[createFuelType]}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${fuelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {fuelDropdownOpen && (
                <div className="absolute z-20 mt-1 ui-card p-1 min-w-[160px]">
                  {ALL_FUEL_TYPES.map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => { setCreateFuelType(ft); setFuelDropdownOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${createFuelType === ft ? 'bg-slate-50' : ''}`}
                    >
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${FUEL_COLOR[ft]}`}>
                        {FUEL_LABEL[ft]}
                      </span>
                      {createFuelType === ft && (
                        <svg className="ml-auto w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="ui-label">
                Capacity ({FUEL_UNIT[createFuelType]}) <span className="text-red-500">*</span>
              </label>
              <input required type="number" step="0.001" min="1" value={createCapacity}
                onChange={(e) => setCreateCapacity(e.target.value)}
                placeholder="e.g. 25000"
                className="w-32 text-sm" />
            </div>
            <div>
              <label className="ui-label">
                DIP Tolerance ({FUEL_UNIT[createFuelType]}) <span className="text-slate-400">(optional)</span>
              </label>
              <input type="number" step="0.001" min="0" value={createDipTol}
                onChange={(e) => setCreateDipTol(e.target.value)}
                placeholder="e.g. 50"
                className="w-28 text-sm" />
            </div>
            <button type="submit" disabled={createMutation.isPending}
              className="ui-btn ui-btn-primary">
              {createMutation.isPending ? 'Adding...' : 'Add Tank'}
            </button>
          </div>
          {createError && <p className="ui-error-text">{createError}</p>}
        </form>
      </div>
    </div>
  )
}

// ── Credit clients content ────────────────────────────────────────────────────

function CreditClientsContent({ pump }: { pump: PumpSummary }) {
  const queryClient = useQueryClient()

  // Add form state
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Edit state — which client is expanded for editing, and its field values
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // Accordion state — only one parent can be expanded at a time; null = all collapsed
  const [expandedParentId, setExpandedParentId] = useState<number | null>(null)
  const toggleCollapse = (id: number) =>
    setExpandedParentId(prev => prev === id ? null : id)

  // Sub-account add form state — tracks which parent's inline add form is open
  const [addSubParentId,   setAddSubParentId]  = useState<number | null>(null)
  const [addSubName,       setAddSubName]       = useState('')
  const [addSubPhone,      setAddSubPhone]      = useState('')
  const [addSubNotes,      setAddSubNotes]      = useState('')
  const [addSubError,      setAddSubError]      = useState<string | null>(null)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['creditClients', pump.id],
    queryFn:  () => pumpApi.getCreditClients(pump.id),
  })

  const addMutation = useMutation({
    mutationFn: (req: { name: string; phone: string; notes?: string; parentClientId?: number }) =>
      pumpApi.createCreditClient(pump.id, req),
    onSuccess: () => {
      setName(''); setPhoneNumber(''); setNotes(''); setAddError(null)
      setAddSubName(''); setAddSubPhone(''); setAddSubNotes(''); setAddSubError(null); setAddSubParentId(null)
      queryClient.invalidateQueries({ queryKey: ['creditClients', pump.id] })
    },
    onError: (err: any, variables) => {
      const msg = err?.response?.data?.message ?? 'Failed to add client'
      if (variables.parentClientId != null) {
        setAddSubError(msg)
      } else {
        setAddError(msg)
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ clientId, req }: { clientId: number; req: UpdateCreditClientRequest }) =>
      pumpApi.updateCreditClient(pump.id, clientId, req),
    onSuccess: () => {
      setEditingId(null); setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['creditClients', pump.id] })
    },
    onError: (err: any) => setEditError(err?.response?.data?.message ?? 'Failed to update client'),
  })

  const deleteMutation = useMutation({
    mutationFn: (clientId: number) => pumpApi.deleteCreditClient(pump.id, clientId),
    onSuccess: () => {
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ['creditClients', pump.id] })
    },
    onError: (err: any) => setAddError(err?.response?.data?.message ?? 'Failed to delete client'),
  })

  const startEdit = (c: CreditClient) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPhone(c.phone ?? '')
    setEditNotes(c.notes ?? '')
    setEditError(null)
    setConfirmDeleteId(null)
  }

  const submitEdit = (e: React.FormEvent, clientId: number) => {
    e.preventDefault(); setEditError(null)
    if (!/^\d{10}$/.test(editPhone.trim())) {
      setEditError('Phone must be exactly 10 digits.'); return
    }
    updateMutation.mutate({
      clientId,
      req: {
        name: editName.trim(),
        phone: editPhone.trim(),
        notes: editNotes.trim() || undefined,
      },
    })
  }

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    const trimmedName  = name.trim()
    const trimmedPhone = phoneNumber.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) {
      setAddError('Phone number must be exactly 10 digits.'); return
    }
    const duplicate = (clients as CreditClient[]).some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (duplicate) {
      setAddError(`A client named "${trimmedName}" already exists.`); return
    }
    addMutation.mutate({ name: trimmedName, phone: trimmedPhone, notes: notes.trim() || undefined })
  }

  const submitAddSub = (e: React.FormEvent, parentId: number) => {
    e.preventDefault(); setAddSubError(null)
    const trimmedName  = addSubName.trim()
    const trimmedPhone = addSubPhone.trim()
    if (!/^\d{10}$/.test(trimmedPhone)) {
      setAddSubError('Phone number must be exactly 10 digits.'); return
    }
    const duplicate = (clients as CreditClient[]).some(
      (c) => c.parentClientId === parentId && c.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (duplicate) {
      setAddSubError(`A sub-account named "${trimmedName}" already exists under this parent.`); return
    }
    addMutation.mutate(
      { name: trimmedName, phone: trimmedPhone, notes: addSubNotes.trim() || undefined, parentClientId: parentId },
    )
  }

  // Group clients: root accounts with their children
  const rootClients = (clients as CreditClient[]).filter(c => c.parentClientId === null)
  const childrenByParent = (clients as CreditClient[]).reduce<Record<number, CreditClient[]>>((acc, c) => {
    if (c.parentClientId !== null) {
      acc[c.parentClientId] = [...(acc[c.parentClientId] ?? []), c]
    }
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Parties who take fuel on credit. Operators pick from this list when closing a shift.
        Only Owner/Admin can add, edit, or remove clients.
      </p>

      {/* Client list — grouped by parent/child hierarchy */}
      {!isLoading && rootClients.length > 0 && (
        <div className="space-y-3">
          {rootClients.map((parent) => {
            const children = childrenByParent[parent.id] ?? []
            const hasChildren = children.length > 0
            const isExpanded = expandedParentId === parent.id
            return (
              <div key={parent.id} className="ui-card p-0 overflow-hidden">

                {/* ── Parent account row ── */}
                <div
                  className={`ui-accordion-trigger ${hasChildren ? 'cursor-pointer select-none' : ''}`}
                  onClick={hasChildren ? () => toggleCollapse(parent.id) : undefined}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {hasChildren && (
                      <svg
                        className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-700">{parent.name}</p>
                        {parent.isParent && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            parent · {children.length} sub-account{children.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {parent.phone && <span className="text-xs text-slate-400">{parent.phone}</span>}
                        {parent.notes && <span className="text-xs text-slate-400 italic truncate max-w-xs">{parent.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0" onClick={e => e.stopPropagation()}>
                    {confirmDeleteId === parent.id ? (
                      <>
                        <span className="text-xs text-red-600">Remove?</span>
                        <button onClick={() => deleteMutation.mutate(parent.id)} disabled={deleteMutation.isPending}
                          className="ui-btn ui-btn-danger min-h-0 px-2 py-1 text-xs">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="ui-btn ui-btn-secondary min-h-0 px-2 py-1 text-xs">No</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            const nextParentId = addSubParentId === parent.id ? null : parent.id
                            setAddSubParentId(nextParentId)
                            if (nextParentId === parent.id) {
                              setExpandedParentId(parent.id)
                            }
                            setAddSubName(''); setAddSubPhone(''); setAddSubNotes(''); setAddSubError(null)
                          }}
                          className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 hover:border-blue-400"
                        >
                          + Sub-account
                        </button>
                        <button
                          onClick={() => editingId === parent.id ? setEditingId(null) : startEdit(parent)}
                          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
                        >
                          {editingId === parent.id ? 'Cancel' : 'Edit'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(parent.id)}
                          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline edit form for parent */}
                {editingId === parent.id && (
                  <form onSubmit={(e) => submitEdit(e, parent.id)}
                    className="px-3 py-3 border-t border-slate-100 bg-white space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="ui-label">Name <span className="text-red-500">*</span></label>
                        <input required value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="text-xs min-h-10" />
                      </div>
                      <div>
                        <label className="ui-label">Phone <span className="text-red-500">*</span></label>
                        <input required value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          inputMode="numeric" maxLength={10}
                          className="text-xs min-h-10" />
                      </div>
                    </div>
                    <div>
                      <label className="ui-label">Notes <span className="text-slate-400">(optional)</span></label>
                      <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="e.g. Fleet manager, lorry owner"
                        className="text-xs min-h-10" />
                    </div>
                    {editError && <p className="ui-error-text">{editError}</p>}
                    <button type="submit" disabled={updateMutation.isPending}
                      className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </form>
                )}

                {/* ── Sub-accounts ── */}
                {isExpanded && children.map((child) => (
                  <div key={child.id} className="border-t border-slate-100">
                    <div className="flex items-center justify-between pl-7 pr-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-300 shrink-0">└</span>
                        <div>
                          <p className="text-sm font-medium text-slate-600">{child.name}</p>
                          <div className="flex items-center gap-3">
                            {child.phone && <span className="text-xs text-slate-400">{child.phone}</span>}
                            {child.notes && <span className="text-xs text-slate-400 italic truncate max-w-xs">{child.notes}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {confirmDeleteId === child.id ? (
                          <>
                            <span className="text-xs text-red-600">Remove?</span>
                            <button onClick={() => deleteMutation.mutate(child.id)} disabled={deleteMutation.isPending}
                              className="ui-btn ui-btn-danger min-h-0 px-2 py-1 text-xs">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="ui-btn ui-btn-secondary min-h-0 px-2 py-1 text-xs">No</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => editingId === child.id ? setEditingId(null) : startEdit(child)}
                              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
                              {editingId === child.id ? 'Cancel' : 'Edit'}
                            </button>
                            <button onClick={() => setConfirmDeleteId(child.id)}
                              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-red-400 hover:text-red-600">
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Inline edit form for child */}
                    {editingId === child.id && (
                      <form onSubmit={(e) => submitEdit(e, child.id)}
                        className="pl-7 pr-3 py-3 border-t border-slate-100 bg-white space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="ui-label">Name <span className="text-red-500">*</span></label>
                            <input required value={editName} onChange={(e) => setEditName(e.target.value)}
                              className="text-xs min-h-10" />
                          </div>
                          <div>
                            <label className="ui-label">Phone <span className="text-red-500">*</span></label>
                            <input required value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              inputMode="numeric" maxLength={10}
                              className="text-xs min-h-10" />
                          </div>
                        </div>
                        <div>
                          <label className="ui-label">Notes <span className="text-slate-400">(optional)</span></label>
                          <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="e.g. Fleet manager, lorry owner"
                            className="text-xs min-h-10" />
                        </div>
                        {editError && <p className="ui-error-text">{editError}</p>}
                        <button type="submit" disabled={updateMutation.isPending}
                          className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                          {updateMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                      </form>
                    )}
                  </div>
                ))}

                {/* ── Inline add sub-account form ── */}
                {addSubParentId === parent.id && (
                  <form onSubmit={(e) => submitAddSub(e, parent.id)}
                    className="border-t border-blue-100 bg-blue-50/40 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-700">
                      Add sub-account under {parent.name}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="ui-label">Name <span className="text-red-500">*</span></label>
                        <input required value={addSubName} onChange={(e) => setAddSubName(e.target.value)}
                          placeholder="e.g. Driver 1"
                          className="text-xs min-h-10" />
                      </div>
                      <div>
                        <label className="ui-label">Phone <span className="text-red-500">*</span></label>
                        <input required value={addSubPhone}
                          onChange={(e) => setAddSubPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          inputMode="numeric" maxLength={10}
                          placeholder="e.g. 9876543210"
                          className="text-xs min-h-10" />
                      </div>
                    </div>
                    <div>
                      <label className="ui-label">Notes <span className="text-slate-400">(optional)</span></label>
                      <input value={addSubNotes} onChange={(e) => setAddSubNotes(e.target.value)}
                        placeholder="e.g. truck number, driver name"
                        className="text-xs min-h-10" />
                    </div>
                    {addSubError && <p className="ui-error-text">{addSubError}</p>}
                    <div className="flex gap-2">
                      <button type="submit" disabled={addMutation.isPending}
                        className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs">
                        {addMutation.isPending ? 'Adding...' : 'Add Sub-account'}
                      </button>
                      <button type="button" onClick={() => setAddSubParentId(null)}
                        className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      <div className={clients.length > 0 ? 'border-t border-slate-200 pt-4' : ''}>
        <p className="ui-label mb-3">
          {clients.length === 0 ? 'Add the first credit client' : 'Add another client'}
        </p>
        <form onSubmit={submitAdd} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">Client Name <span className="text-red-500">*</span></label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ABC Transports"
                className="text-sm" />
            </div>
            <div>
              <label className="ui-label">Phone <span className="text-red-500">*</span></label>
              <input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="e.g. 9876543210"
                inputMode="numeric"
                maxLength={10}
                className="text-sm" />
            </div>
          </div>
          <div>
            <label className="ui-label">Notes <span className="text-slate-400">(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Fleet manager, lorry owner"
              className="text-sm" />
          </div>
          {addError && <p className="ui-error-text">{addError}</p>}
          <button type="submit" disabled={addMutation.isPending}
            className="ui-btn ui-btn-primary">
            {addMutation.isPending ? 'Adding...' : 'Add Client'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Shift Definitions Content ─────────────────────────────────────────────────

/**
 * Subtracts 1 minute from a "HH:MM" time string.
 * End times are stored as exclusive upper bounds: user sees "09:00", backend stores "08:59".
 * This ensures consecutive shifts (one ending at 09:00, next starting at 09:00) don't overlap.
 */
function subtractOneMinute(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const totalMins = h * 60 + m - 1
  const adjusted = (totalMins + 1440) % 1440 // wrap around midnight
  const hh = String(Math.floor(adjusted / 60)).padStart(2, '0')
  const mm = String(adjusted % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

const TIME_OPTS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  const value = `${String(h).padStart(2, '0')}:${m}`
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  const label = `${h12}:${m} ${ampm}`
  return { value, label }
})

const SORT_ORDER_OPTS = [1, 2, 3, 4].map(n => ({ value: String(n), label: `#${n}` }))

interface ShiftRow {
  name: string
  startTime: string
  endTime: string
  isNightShift: boolean
  sortOrder: number
}

function defaultRows(): ShiftRow[] {
  return [{ name: '', startTime: '06:00', endTime: '14:00', isNightShift: false, sortOrder: 1 }]
}

function ShiftDefinitionsContent({ pumpId }: { pumpId: number }) {
  const qc = useQueryClient()

  const { data: allDefs = [], isLoading } = useQuery({
    queryKey: ['shift-definitions', pumpId],
    queryFn: () => shiftDefinitionApi.getAll(pumpId),
  })

  // Group by (effectiveFrom, effectiveTo) composite key — two groups can share the same
  // effectiveFrom when a disabled group and a new active group coexist on the same date.
  const groups = allDefs.reduce<Record<string, typeof allDefs>>((acc, d) => {
    const key = `${d.effectiveFrom}|${d.effectiveTo ?? 'open'}`
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})
  // Sort newest effectiveFrom first; within same date, active (open-ended) groups come before disabled.
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
    const [aFrom, aTo] = a.split('|')
    const [bFrom, bTo] = b.split('|')
    if (bFrom !== aFrom) return bFrom.localeCompare(aFrom)
    // Same effectiveFrom: active ('open') sorts before disabled (a date string)
    if (aTo === 'open') return -1
    if (bTo === 'open') return 1
    return bTo.localeCompare(aTo)
  })

  // ── Create new batch form ───────────────────────────────────────────────────

  const [showForm, setShowForm] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [hasEndDate, setHasEndDate] = useState(false)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [rows, setRows] = useState<ShiftRow[]>(defaultRows)
  const [formError, setFormError] = useState<string | null>(null)

  const resetForm = () => {
    setShowForm(false)
    setRows(defaultRows())
    setEffectiveFrom('')
    setHasEndDate(false)
    setEffectiveTo('')
    setFormError(null)
  }

  const createMutation = useMutation({
    mutationFn: (reqs: CreateShiftDefinitionRequest[]) =>
      shiftDefinitionApi.createBatch(pumpId, reqs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      resetForm()
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message ?? 'Failed to save shift definitions')
    },
  })

  const [actionError, setActionError] = useState<string | null>(null)

  // ── Collapsible groups — disabled groups start collapsed ────────────────────
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [collapsedInitialized, setCollapsedInitialized] = useState(false)
  useEffect(() => {
    if (!collapsedInitialized && Object.keys(groups).length > 0) {
      const disabled = new Set<string>()
      Object.entries(groups).forEach(([groupKey, defs]) => {
        // Collapse groups where every definition is disabled (effectiveTo is set).
        if (defs.every(d => d.effectiveTo !== null)) disabled.add(groupKey)
      })
      setCollapsedDates(disabled)
      setCollapsedInitialized(true)
    }
  }, [groups, collapsedInitialized])
  const toggleCollapsed = (date: string) =>
    setCollapsedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })

  // ── Delete ──────────────────────────────────────────────────────────────────
  // Stores the composite group key "effectiveFrom|effectiveTo" of the group pending deletion.
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (groupKey: string) => {
      const [effectiveFrom, effectiveToRaw] = groupKey.split('|')
      const effectiveTo = effectiveToRaw === 'open' ? null : effectiveToRaw
      return shiftDefinitionApi.deleteGroup(pumpId, effectiveFrom, effectiveTo)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      setConfirmDeleteKey(null)
      setActionError(null)
    },
    onError: (err: any) => {
      setConfirmDeleteKey(null)
      setActionError(err?.response?.data?.message ?? 'Failed to delete shift schedule')
    },
  })

  // ── Disable ─────────────────────────────────────────────────────────────────
  const [disablingDate, setDisablingDate] = useState<string | null>(null) // effectiveFrom of group being disabled
  const [disableFromToday, setDisableFromToday] = useState(true)
  const [disablePickedDate, setDisablePickedDate] = useState('')

  const todayStr = localDateInputValue()

  const disableMutation = useMutation({
    mutationFn: ({ effectiveFrom, disableDate }: { effectiveFrom: string; disableDate: string }) =>
      shiftDefinitionApi.disableGroup(pumpId, effectiveFrom, disableDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      qc.refetchQueries({ queryKey: ['shift-definitions', pumpId] })
      setDisablingDate(null)
      setActionError(null)
    },
    onError: (err: any) => {
      setDisablingDate(null)
      setActionError(err?.response?.data?.message ?? 'Failed to disable shift schedule')
    },
  })

  const openDisable = (date: string) => {
    setActionError(null)
    setDisableFromToday(true)
    setDisablePickedDate(date) // reuse as default min, will be overridden if user picks
    setDisablingDate(date)
  }

  const confirmDisable = () => {
    if (!disablingDate) return
    const disableDate = disableFromToday ? todayStr : disablePickedDate
    if (!disableDate) { setActionError('Please select a disable date'); return }
    disableMutation.mutate({ effectiveFrom: disablingDate, disableDate })
  }

  const addRow = () => {
    if (rows.length >= 4) return
    setRows(prev => [
      ...prev,
      { name: '', startTime: '06:00', endTime: '14:00', isNightShift: false, sortOrder: prev.length + 1 },
    ])
  }

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const updateRow = (idx: number, patch: Partial<ShiftRow>) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const handleSubmit = () => {
    setFormError(null)
    if (!effectiveFrom) { setFormError('Start date (Effective From) is required'); return }
    if (hasEndDate && !effectiveTo) { setFormError('End date is required when "Has end date" is checked'); return }
    if (hasEndDate && effectiveTo <= effectiveFrom) { setFormError('End date must be after the start date'); return }
    if (rows.some(r => !r.name.trim())) { setFormError('Each shift must have a name'); return }

    // Guard: only the night shift is allowed to cross midnight (endTime < startTime).
    // If a non-night shift has end < start, the user almost certainly picked AM instead of PM.
    const badRow = rows.find(r => !r.isNightShift && r.endTime <= r.startTime)
    if (badRow) {
      setFormError(
        `"${badRow.name}" ends before it starts. Only the Night shift can cross midnight. Did you select AM instead of PM?`
      )
      return
    }

    // End times are exclusive upper bounds: store "end - 1 min" so consecutive shifts
    // can share a boundary (e.g., Night ends displayed as 9:00 AM, Morning starts at 9:00 AM).
    const resolvedEffectiveTo = hasEndDate ? effectiveTo : null
    const reqs: CreateShiftDefinitionRequest[] = rows.map(r => ({
      name: r.name.trim(),
      startTime: r.startTime,
      endTime: subtractOneMinute(r.endTime),
      isNightShift: r.isNightShift,
      sortOrder: r.sortOrder,
      effectiveFrom,
      effectiveTo: resolvedEffectiveTo,
    }))
    createMutation.mutate(reqs)
  }

  if (isLoading) return <p className="text-xs text-slate-400 py-2">Loading…</p>

  return (
    <div className="space-y-4">

      {/* Existing groups */}
      {sortedGroupKeys.length === 0 && !showForm && (
        <p className="text-xs text-slate-400">No shift definitions yet. Add your first schedule below.</p>
      )}

      {sortedGroupKeys.map(groupKey => {
        const defs = groups[groupKey].slice().sort((a, b) => a.sortOrder - b.sortOrder)
        const effectiveFromDate = defs[0].effectiveFrom
        const isActive = defs.some(d => d.effectiveTo === null)
        const isCollapsed = collapsedDates.has(groupKey)
        return (
          <div key={groupKey} className="ui-card p-0 overflow-hidden">
            <div
              className="ui-accordion-trigger cursor-pointer select-none"
              onClick={() => toggleCollapsed(groupKey)}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                <span className="text-xs font-semibold text-slate-700">
                  {effectiveFromDate}
                  {defs[0]?.effectiveTo ? ` – ${defs[0].effectiveTo}` : ' onwards'}
                </span>
                {isActive
                  ? <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
                  : <span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Disabled</span>
                }
              </div>
              <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                {/* Disable button — only for open-ended (active) groups */}
                {isActive && (
                  confirmDeleteKey === groupKey ? null : (
                    <button
                      onClick={() => openDisable(effectiveFromDate)}
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                    >
                      Disable
                    </button>
                  )
                )}
                {/* Delete button with confirm — available for all groups (active or disabled) */}
                {confirmDeleteKey === groupKey ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">Delete this group?</span>
                    <button
                      onClick={() => deleteMutation.mutate(groupKey)}
                      disabled={deleteMutation.isPending}
                      className="ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs disabled:opacity-40"
                    >
                      {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteKey(null)}
                      className="ui-btn ui-btn-secondary min-h-0 px-2 py-0.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setActionError(null); setConfirmDeleteKey(groupKey) }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Delete group
                  </button>
                )}
              </div>
            </div>
            {/* Collapsible body — disable form + shift rows */}
            {!isCollapsed && (<>
            {/* Disable inline form */}
            {disablingDate === effectiveFromDate && (
              <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 space-y-3">
                <p className="text-xs font-medium text-amber-800">
                  Disable this schedule — operators will not be able to open new shifts after the selected date.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableFromToday}
                    onChange={e => setDisableFromToday(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-600"
                  />
                  <span className="text-xs text-slate-700">Disable from today ({todayStr})</span>
                </label>
                {!disableFromToday && (
                  <div>
                    <label className="ui-label">Last active date</label>
                    <input
                      type="date"
                      value={disablePickedDate}
                      min={todayStr}
                      onChange={e => setDisablePickedDate(e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-xs text-slate-400 mt-1">The schedule will remain active until this date.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={confirmDisable}
                    disabled={disableMutation.isPending}
                    className="ui-btn min-h-0 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40"
                  >
                    {disableMutation.isPending ? 'Disabling…' : 'Confirm Disable'}
                  </button>
                  <button
                    onClick={() => setDisablingDate(null)}
                    className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {defs.map(d => (
                <div key={d.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-4">#{d.sortOrder}</span>
                  <span className="text-sm font-medium text-slate-800 flex-1">{d.name}</span>
                  <span className="text-xs text-slate-500">{d.windowLabel}</span>
                  {d.isNightShift && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Night</span>
                  )}
                </div>
              ))}
            </div>
            </>)}
          </div>
        )
      })}

      {actionError && (
        <div className="ui-alert ui-alert-danger flex items-start gap-2">
          <span className="text-red-600 text-xs flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="ui-btn ui-btn-ghost min-h-0 p-0 text-sm leading-none text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* New batch form */}
      {showForm ? (
        <div className="ui-card-plain p-4 space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">New Shift Schedule</h4>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">Start Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="ui-label mb-0">End Date</label>
                <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasEndDate}
                    onChange={e => { setHasEndDate(e.target.checked); if (!e.target.checked) setEffectiveTo('') }}
                    className="w-3 h-3 accent-blue-600"
                  />
                  Set end date
                </label>
              </div>
              <input
                type="date"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                disabled={!hasEndDate}
                min={effectiveFrom || undefined}
                className="text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!hasEndDate && (
                <p className="text-xs text-slate-400 mt-1">Open-ended — no expiry date</p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400 -mt-2">
            Any previously open schedule will be automatically closed on the day before the start date.
            You cannot create two schedules with overlapping date ranges.
          </p>

          {/* Shift rows */}
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const otherRows = rows.filter((_, i) => i !== idx)
              // Only block times used by rows that have been named — unnamed rows have default
              // placeholder times that should not restrict other rows' options.
              const configuredOtherRows = otherRows.filter(r => r.name.trim() !== '')
              const usedStarts = new Set(configuredOtherRows.map(r => r.startTime))
              const usedEnds   = new Set(configuredOtherRows.map(r => r.endTime))
              const startOpts  = TIME_OPTS.filter(o => !usedStarts.has(o.value))
              const endOpts    = TIME_OPTS.filter(o => !usedEnds.has(o.value))
              return (
              <div key={idx} className="grid gap-2 items-center md:grid-cols-[minmax(0,12rem)_minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)_minmax(6.5rem,7.5rem)_auto]">
                <input
                  placeholder="Name (e.g. Morning)"
                  value={row.name}
                  onChange={e => updateRow(idx, { name: e.target.value })}
                  className="min-w-0 text-sm md:max-w-[12rem]"
                />
                <SearchableSelect
                  value={row.startTime}
                  onChange={v => updateRow(idx, { startTime: v })}
                  options={startOpts}
                  size="sm"
                  className="min-w-0"
                />
                <span className="text-xs text-slate-400">→</span>
                <SearchableSelect
                  value={row.endTime}
                  onChange={v => updateRow(idx, { endTime: v })}
                  options={endOpts}
                  size="sm"
                  className="min-w-0"
                />
                <SearchableSelect
                  value={String(row.sortOrder)}
                  onChange={v => updateRow(idx, { sortOrder: Number(v) })}
                  options={SORT_ORDER_OPTS}
                  size="sm"
                  className="min-w-0"
                />
                <div className="flex items-center gap-1.5">
                  <input
                    id={`night-${idx}`}
                    type="checkbox"
                    checked={row.isNightShift}
                    onChange={e => updateRow(idx, { isNightShift: e.target.checked })}
                    className="w-3.5 h-3.5 accent-indigo-600"
                  />
                  <label htmlFor={`night-${idx}`} className="text-xs text-slate-600 select-none">Night</label>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(idx)} className="ui-btn ui-btn-ghost min-h-0 ml-1 p-0 text-base leading-none text-red-400 hover:text-red-600">&times;</button>
                  )}
                </div>
              </div>
              )
            })}
          </div>

          {rows.length < 4 && (
            <button
              type="button"
              onClick={addRow}
              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
            >
              + Add another shift
            </button>
          )}

          {formError && <p className="ui-error-text">{formError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="ui-btn ui-btn-primary"
            >
              {createMutation.isPending ? 'Saving…' : 'Save Schedule'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="ui-btn ui-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
        >
          + Add new shift schedule
        </button>
      )}
    </div>
  )
}
