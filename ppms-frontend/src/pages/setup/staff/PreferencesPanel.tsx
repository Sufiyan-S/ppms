import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { shiftPlanApi, DAY_LABELS } from '../../../api/shiftPlanApi'
import type { PreferredDayOff, StaffPreference } from '../../../api/shiftPlanApi'
import type { StaffMember } from '../../../api/userApi'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'

interface Props {
  pumpId: number
  member: StaffMember
  activeShiftDefs: ShiftDefinition[]
  onClose: () => void
}

export function PreferencesPanel({ pumpId, member, activeShiftDefs, onClose }: Props) {
  const { data: savedPreference, isLoading, isError } = useQuery({
    queryKey: ['staffPref', pumpId, member.id],
    queryFn: () => shiftPlanApi.getPreference(pumpId, member.id),
  })

  return (
    <div className="px-3 py-3 border-t border-slate-100">
      <div className="max-w-sm space-y-3">
        <p className="text-xs font-semibold text-slate-700">Shift preferences for {member.fullName}</p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
            <Spinner className="w-3 h-3" />Loading saved preferences…
          </div>
        ) : isError ? (
          <p className="ui-error-text" role="alert">Could not load saved preferences. Close and try again.</p>
        ) : (
          <PreferencesForm
            pumpId={pumpId}
            member={member}
            activeShiftDefs={activeShiftDefs}
            savedPreference={savedPreference}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

interface FormProps extends Props {
  savedPreference: StaffPreference | undefined
}

function PreferencesForm({ pumpId, member, activeShiftDefs, savedPreference, onClose }: FormProps) {
  const queryClient = useQueryClient()
  const [prefShiftDefId, setPrefShiftDefId] = useState<number | null>(savedPreference?.preferredShiftDefinitionId ?? null)
  const [prefDayOff, setPrefDayOff] = useState<PreferredDayOff | ''>(savedPreference?.preferredDayOff ?? '')
  const [prefError, setPrefError] = useState<string | null>(null)

  const prefMutation = useMutation({
    mutationFn: () => shiftPlanApi.setPreference(pumpId, member.id, prefShiftDefId, prefDayOff || null),
    onSuccess: () => {
      setPrefError(null)
      queryClient.invalidateQueries({ queryKey: ['staffPref', pumpId, member.id] })
    },
    onError: (err) => setPrefError(parseApiError(err, 'Failed to save preferences')),
  })

  return (
    <>
      <div>
        <span className="ui-label">Preferred shift</span>
        <SearchableSelect label="Preferred shift"
          value={prefShiftDefId !== null ? String(prefShiftDefId) : ''}
          onChange={v => setPrefShiftDefId(v ? Number(v) : null)}
          placeholder="Any shift"
          size="sm"
          options={activeShiftDefs.map(d => ({ value: String(d.id), label: `${d.name} · ${d.windowLabel}` }))}
        />
      </div>
      <div>
        <span className="ui-label">Preferred day off</span>
        <SearchableSelect label="Preferred day off"
          value={prefDayOff}
          onChange={v => setPrefDayOff(v as PreferredDayOff | '')}
          placeholder="No preference"
          size="sm"
          options={Object.entries(DAY_LABELS).map(([val, label]) => ({ value: val, label }))}
        />
      </div>
      {prefError && <p className="ui-error-text" role="alert">{prefError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => prefMutation.mutate()}
          disabled={prefMutation.isPending}
          className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs"
        >
          {prefMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
        </button>
        <button type="button" onClick={onClose}
          className="ui-btn ui-btn-secondary min-h-0 px-3 py-1.5 text-xs">
          Done
        </button>
      </div>
    </>
  )
}
