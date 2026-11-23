import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { Fuel, History } from 'lucide-react'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { CalibrationForm } from './CalibrationForm'
import { CalibrationHistory } from './CalibrationHistory'
import { useCalibrationHistory } from './useCalibrationHistory'

export default function CalibrationPage() {
  const { t } = useTranslation('calibration')
  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: dus = [], error: dusError } = useQuery({
    queryKey:  ['dus', pumpId],
    queryFn:   () => pumpApi.getDUs(pumpId!),
    enabled:   !!pumpId,
  })
  const nozzles = dus.flatMap((d) => d.nozzles)

  const history = useCalibrationHistory(pumpId)
  const { calibrationsPage, calibrations, calibrationsError } = history

  const showHistoryFor = (nozzleId: number) => {
    history.setHistoryNozzleId(nozzleId)
    history.setHistoryPage(0)
  }

  const recordCount = calibrationsPage?.totalElements ?? calibrations?.length ?? 0

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pumpId && (
          <>
            <StatusBadge tone="neutral" icon={Fuel} label={t('page.nozzleCount', { count: nozzles.length })} />
            <StatusBadge tone="neutral" icon={History} label={t('page.recordCount', { count: recordCount })} />
          </>
        )}
      />

      {(dusError || calibrationsError) && (
        <div className="ui-alert ui-alert-warning text-sm">
          {t('page.loadFailed')}
        </div>
      )}

      <CalibrationForm pumpId={pumpId} nozzles={nozzles} onRecorded={showHistoryFor} />

      <CalibrationHistory history={history} nozzles={nozzles} />
    </Page>
  )
}
