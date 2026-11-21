import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gauge, Database, IndianRupee, Users, Clock, Settings, Truck, Receipt } from 'lucide-react'
import { pumpApi } from '../../api/pumpApi'
import { userApi } from '../../api/userApi'
import { useAuthStore } from '../../store/authStore'
import type { PumpSummary } from '../../api/pumpApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { AccordionSection } from './AccordionSection'
import { FuelPricesContent } from './FuelPricesContent'
import { GstDetailsContent } from './GstDetailsContent'
import { PumpSettingsContent } from './PumpSettingsContent'
import { TanksContent } from './TanksContent'
import { NozzleContent } from './nozzles/NozzleContent'
import type { SectionKey } from './sectionKey'
import { ShiftDefinitionsContent } from './shiftDefinitions/ShiftDefinitionsContent'
import { StaffContent } from './staff/StaffContent'
import { TankersContent } from './tankers/TankersContent'

export function PumpManagementPanel({
  pump,
  onPumpUpdated,
}: {
  pump: PumpSummary
  onPumpUpdated: () => void
}) {
  const { user } = useAuthStore()
  const isManager = user?.role === 'MANAGER'
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
            <h2 className="font-bold text-white text-base">{pump.name}</h2>
            <p className="text-slate-500 text-xs mt-0.5">{pump.address}</p>
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

        {/* ── Manager access note ── */}
        {isManager && (
          <div className="flex items-start gap-2.5 px-5 py-3 bg-blue-50/60 border-b border-blue-100">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            </svg>
            <p className="text-xs text-blue-700">
              You can update daily fuel prices below. Other pump settings are managed by your Owner or Admin.
            </p>
          </div>
        )}

        {/* ── Nozzles — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="nozzles"
            open={openSection === 'nozzles'}
            onToggle={() => toggle('nozzles')}
            icon={<div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Gauge size={14} strokeWidth={2} className="text-slate-600" /></div>}
            title="Dispensary Units"
            summary={`${pump.dus.length} of ${pump.maxDuCount} DUs configured`}
            badgeColor="bg-slate-100 text-slate-600"
          >
            <NozzleContent pump={pump} onAdded={onPumpUpdated} />
          </AccordionSection>
        )}

        {/* ── Tanks — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="tanks"
            open={openSection === 'tanks'}
            onToggle={() => toggle('tanks')}
            icon={<div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><Database size={14} strokeWidth={2} className="text-blue-600" /></div>}
            title="Underground Tanks"
            summary={pump.dus.length > 0 ? 'Tap to configure capacity' : 'Add a DU first'}
            badgeColor="bg-blue-50 text-blue-700"
          >
            <TanksContent pump={pump} />
          </AccordionSection>
        )}

        {/* ── Fuel Prices — all roles including MANAGER ── */}
        <AccordionSection
          sectionKey="prices"
          open={openSection === 'prices'}
          onToggle={() => toggle('prices')}
          icon={<div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><IndianRupee size={14} strokeWidth={2} className="text-emerald-600" /></div>}
          title="Fuel Prices"
          summary={priceSummary}
          badgeColor="bg-emerald-50 text-emerald-700"
        >
          <FuelPricesContent pump={pump} currentPrices={currentPrices} />
        </AccordionSection>

        {/* ── Staff — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="staff"
            open={openSection === 'staff'}
            onToggle={() => toggle('staff')}
            icon={<div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0"><Users size={14} strokeWidth={2} className="text-indigo-600" /></div>}
            title="Staff"
            summary={staff.length > 0 ? `${staff.length} member${staff.length !== 1 ? 's' : ''}` : 'None added'}
            badgeColor="bg-blue-50 text-blue-700"
          >
            <StaffContent pump={pump} />
          </AccordionSection>
        )}

        {/* ── Shift Definitions — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="shifts"
            open={openSection === 'shifts'}
            onToggle={() => toggle('shifts')}
            icon={<div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0"><Clock size={14} strokeWidth={2} className="text-violet-600" /></div>}
            title="Shift Definitions"
            summary={(() => {
              const groupCount = new Set(shiftDefs.map(d => `${d.effectiveFrom}|${d.effectiveTo ?? 'open'}`)).size
              return groupCount > 0 ? `${groupCount} schedule${groupCount !== 1 ? 's' : ''}` : 'Not configured'
            })()}
            badgeColor="bg-violet-50 text-violet-700"
          >
            <ShiftDefinitionsContent pumpId={pump.id} />
          </AccordionSection>
        )}

        {/* ── Tankers — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="tankers"
            open={openSection === 'tankers'}
            onToggle={() => toggle('tankers')}
            icon={<div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0"><Truck size={14} strokeWidth={2} className="text-orange-600" /></div>}
            title="Tankers (Trucks)"
            summary="Configure tanker sizes and set the default"
            badgeColor="bg-orange-50 text-orange-700"
          >
            <TankersContent pumpId={pump.id} />
          </AccordionSection>
        )}

        {/* ── Pump Settings — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="settings"
            open={openSection === 'settings'}
            onToggle={() => toggle('settings')}
            icon={<div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><Settings size={14} strokeWidth={2} className="text-amber-600" /></div>}
            title="Thresholds & Rules"
            summary={pump.discrepancyEscalationThreshold ? `Escalation: ₹${pump.discrepancyEscalationThreshold}` : 'Not configured'}
            badgeColor="bg-amber-50 text-amber-700"
          >
            <PumpSettingsContent pump={pump} onUpdated={onPumpUpdated} />
          </AccordionSection>
        )}

        {/* ── GST & Invoices — OWNER/ADMIN only ── */}
        {!isManager && (
          <AccordionSection
            sectionKey="gst"
            open={openSection === 'gst'}
            onToggle={() => toggle('gst')}
            icon={<div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0"><Receipt size={14} strokeWidth={2} className="text-sky-600" /></div>}
            title="GST & Invoices"
            summary={pump.gstin ? `GSTIN ${pump.gstin}` : 'Not configured'}
            badgeColor="bg-sky-50 text-sky-700"
          >
            <GstDetailsContent pump={pump} onUpdated={onPumpUpdated} />
          </AccordionSection>
        )}

      </div>
    </div>
  )
}
