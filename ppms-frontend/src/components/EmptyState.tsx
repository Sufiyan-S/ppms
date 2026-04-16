import type { ReactNode } from 'react'

type EmptyIcon = 'expenses' | 'payroll' | 'transactions' | 'shifts' | 'generic'

interface EmptyStateProps {
  icon?: EmptyIcon
  title: string
  subtitle?: string
}

const ICONS: Record<EmptyIcon, ReactNode> = {
  expenses: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="6" width="36" height="52" rx="5" stroke="currentColor" strokeWidth="3"/>
      <path d="M22 20h20M22 28h20M22 36h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M14 54l7-4 7 4 7-4 7 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  payroll: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="26" cy="20" r="9" stroke="currentColor" strokeWidth="3"/>
      <path d="M8 56c0-9.941 8.059-18 18-18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="46" cy="38" r="10" stroke="currentColor" strokeWidth="3"/>
      <path d="M41 38h10M46 33v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  transactions: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="6" y="14" width="52" height="36" rx="6" stroke="currentColor" strokeWidth="3"/>
      <path d="M6 24h52" stroke="currentColor" strokeWidth="3"/>
      <path d="M16 34h10M16 39h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M42 30l8 4-8 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  shifts: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="3"/>
      <path d="M32 16v16l10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 10l4 4M48 10l-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  generic: (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M10 48V24l22-12 22 12v24l-22 12L10 48z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M10 24l22 12M54 24L32 36M32 36v24" stroke="currentColor" strokeWidth="3"/>
    </svg>
  ),
}

export function EmptyState({ icon = 'generic', title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-12 gap-4">
      <div className="w-16 h-16 text-slate-200">
        {ICONS[icon]}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
