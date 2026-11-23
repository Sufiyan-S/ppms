import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { parseApiError } from '../../../utils/apiError'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { pumpApi } from '../../../api/pumpApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { RowPanel, RowPanelActions } from './RowPanel'

interface Props {
  pumpId: number
  member: StaffMember
  onClose: () => void
}

export function MoveToPumpPanel({ pumpId, member, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const queryClient = useQueryClient()
  const stillNeededId = useId()
  const [targetPumpId, setTargetPumpId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: pumps = [] } = useQuery({ queryKey: ['myPumps'], queryFn: pumpApi.getMyPumps, staleTime: 5 * 60_000 })
  const otherPumps = pumps.filter(pump => pump.id !== pumpId)
  const currentPumpName = pumps.find(pump => pump.id === pumpId)?.name
  const targetPumpName = otherPumps.find(pump => String(pump.id) === targetPumpId)?.name

  const moveMutation = useMutation({
    mutationFn: (toPumpId: number) => userApi.moveToPump(member.id, toPumpId),
    onSuccess: (_moved, toPumpId) => {
      setError(null)
      onClose()
      queryClient.invalidateQueries({ queryKey: ['staff', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['staff', toPumpId] })
      queryClient.invalidateQueries({ queryKey: ['operators', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['operators', toPumpId] })
    },
    onError: (err) => setError(parseApiError(err, t('staff.move.failed'))),
  })

  const stillNeeded = targetPumpId ? [] : [t('staff.move.selectLabel')]

  return (
    <RowPanel title={t('staff.move.title', { name: member.fullName })} hint={t('staff.move.explanation')}>
      {otherPumps.length === 0 ? (
        <p className="ui-help">{t('staff.move.noOtherPump')}</p>
      ) : (
        <div className="max-w-sm">
          <span className="ui-label">{t('staff.move.selectLabel')}</span>
          <SearchableSelect label={t('staff.move.selectLabel')}
            value={targetPumpId}
            onChange={setTargetPumpId}
            placeholder={t('staff.move.selectPlaceholder')}
            options={otherPumps.map(pump => ({ value: String(pump.id), label: pump.name }))}
          />
        </div>
      )}
      {currentPumpName && targetPumpName && (
        <p className="text-sm text-ink-2">
          <span className="sr-only">{t('staff.move.route', { from: currentPumpName, to: targetPumpName })}</span>
          <span aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
            <span>{currentPumpName}</span>
            <ArrowRight size={14} className="text-ink-3" />
            <span className="font-semibold text-ink">{targetPumpName}</span>
          </span>
        </p>
      )}
      {error && <p role="alert" className="ui-error-text">{error}</p>}
      <RowPanelActions>
        <LoadingButton
          type="button"
          isLoading={moveMutation.isPending}
          loadingLabel={t('staff.move.moving')}
          disabled={otherPumps.length === 0 || stillNeeded.length > 0}
          aria-describedby={otherPumps.length > 0 && stillNeeded.length > 0 ? stillNeededId : undefined}
          onClick={() => moveMutation.mutate(Number(targetPumpId))}
          className="ui-btn-primary ui-btn-compact"
        >
          {t('staff.move.submit')}
        </LoadingButton>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        {otherPumps.length > 0 && <StillNeeded id={stillNeededId} items={stillNeeded} />}
      </RowPanelActions>
    </RowPanel>
  )
}
