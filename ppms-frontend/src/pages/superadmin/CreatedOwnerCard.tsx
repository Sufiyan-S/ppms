import { Check, X, Eye, EyeOff } from 'lucide-react'
import type { OnboardOwnerResponse } from '../../api/superAdminApi'
import { IconButton } from '../../components/IconButton'
import { CredentialField } from './CredentialField'

interface CreatedOwnerCardProps {
  createdOwner: OnboardOwnerResponse
  revealedPassword: string | null
  onToggleReveal: () => void
  onCopy: () => void
  onDismiss: () => void
}

export function CreatedOwnerCard({ createdOwner, revealedPassword, onToggleReveal, onCopy, onDismiss }: CreatedOwnerCardProps) {
  const showPassword = revealedPassword !== null

  return (
    <div className="mb-6 ui-alert ui-alert-success p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Check size={18} strokeWidth={2.5} className="text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 mb-1">
              Owner account created — share these login details
            </p>
            <p className="text-xs text-green-600 mb-3">
              {createdOwner.fullName} can now log in and set up their pump.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CredentialField label="Phone" value={createdOwner.phoneNumber} />
              <div className="ui-card-plain bg-white border-green-200 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs text-green-600">Password</p>
                  <button
                    onClick={onToggleReveal}
                    className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-green-600 hover:text-green-800"
                    title={showPassword ? 'Hide password' : 'Reveal password'}
                  >
                    {showPassword ? <span className="inline-flex items-center gap-1"><EyeOff size={12} strokeWidth={2} />Hide</span> : <span className="inline-flex items-center gap-1"><Eye size={12} strokeWidth={2} />Show</span>}
                  </button>
                </div>
                <p className="text-sm font-semibold text-slate-800 font-mono break-all">
                  {revealedPassword ?? '••••••••'}
                </p>
              </div>
              <CredentialField label="Pump" value={createdOwner.pumpName} />
              <CredentialField label="Employee ID" value={createdOwner.employeeId} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={onCopy}
            className="ui-btn ui-btn-secondary text-xs border-green-300 text-green-700 hover:bg-green-100"
          >
            Copy
          </button>
          <IconButton
            onClick={onDismiss}
            className="ui-btn ui-btn-ghost"
            label="Dismiss"
            icon={<X size={14} strokeWidth={2} />}
          />
        </div>
      </div>
    </div>
  )
}
