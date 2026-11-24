import { useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Building2, Check, ChevronDown, ChevronRight, Clock, Cylinder, Fuel, HandCoins, IndianRupee, Receipt, Truck, Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SetupChecklist } from '../../api/pumpApi'
import { StatusBadge } from '../../components/StatusBadge'
import type { SectionKey } from './sectionKey'
import { SetupStepItems } from './SetupStepItems'
import { searchForStep } from './setupStepOrder'
import type { SectionSummary } from './useSetupOverview'

const HUB_CARDS: readonly { key: SectionKey; icon: LucideIcon }[] = [
  { key: 'settings', icon: Building2 },
  { key: 'gst', icon: Receipt },
  { key: 'tanks', icon: Cylinder },
  { key: 'nozzles', icon: Fuel },
  { key: 'prices', icon: IndianRupee },
  { key: 'shifts', icon: Clock },
  { key: 'staff', icon: Users },
  { key: 'tankers', icon: Truck },
  { key: 'credit', icon: HandCoins },
]

interface SetupHubProps {
  checklist: SetupChecklist | undefined
  summaries: Record<SectionKey, SectionSummary>
}

/** Setup once every required step is done: one card per area with a live summary, each opening that area. */
export function SetupHub({ checklist, summaries }: SetupHubProps) {
  const { t } = useTranslation('setup')
  const [searchParams] = useSearchParams()
  const [isChecklistOpen, setChecklistOpen] = useState(false)
  const headingId = useId()
  const checklistId = useId()

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-(--density-gap)">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="ui-title-sm">{t('hub.title')}</h2>
        <button
          type="button"
          onClick={() => setChecklistOpen(!isChecklistOpen)}
          aria-expanded={isChecklistOpen}
          aria-controls={checklistId}
          className="ui-btn ui-btn-ghost ui-btn-compact text-ok"
        >
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          {t('hub.checklist')}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${isChecklistOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      <div id={checklistId} hidden={!isChecklistOpen} className="ui-card p-0">
        <SetupStepItems currentStep={null} checklist={checklist} replace={false} orientation="horizontal" />
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {HUB_CARDS.map(({ key, icon: Icon }) => {
          const summary = summaries[key]
          return (
            <li key={key}>
              <Link to={{ search: searchForStep(searchParams, key) }} className="ui-hub-card">
                <span aria-hidden="true" className="ui-hub-card__icon"><Icon size={20} strokeWidth={2} /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-ink">{t(`steps.names.${key}`)}</span>
                  <span className="text-xs text-ink-2">{summary.text}</span>
                  {summary.attention && (
                    <StatusBadge tone="warn" icon={AlertTriangle} label={summary.attention} wrap className="mt-1 self-start" />
                  )}
                </span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
