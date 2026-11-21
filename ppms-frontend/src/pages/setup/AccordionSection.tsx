import { ChevronDown } from 'lucide-react'
import type { SectionKey } from './sectionKey'

// ── Accordion section wrapper ─────────────────────────────────────────────────

export function AccordionSection({
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
  icon: React.ReactNode
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
          {icon}
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
            {summary}
          </span>
        </div>
        <ChevronDown size={14} strokeWidth={2} className={`text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-6 pt-2 border-t border-slate-100 bg-slate-50/30">
          {children}
        </div>
      )}
    </div>
  )
}
