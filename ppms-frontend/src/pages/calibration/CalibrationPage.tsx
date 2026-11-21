import { useQuery } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { Reveal } from '../../components/Reveal'
import { CalibrationForm } from './CalibrationForm'
import { CalibrationHistory } from './CalibrationHistory'
import { useCalibrationHistory } from './useCalibrationHistory'

export default function CalibrationPage() {
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

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Compliance</p>
          <h1 className="ui-title-sm">Nozzle Calibration</h1>
          <p className="ui-subtitle">Record periodic calibration checks for regulatory compliance</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Nozzles</span>
            <span className="ui-section-meta-value">{nozzles.length}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">History</span>
            <span className="ui-section-meta-value">{calibrationsPage?.totalElements ?? calibrations?.length ?? 0}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {(dusError || calibrationsError) && (
        <div className="ui-alert ui-alert-warning text-sm">
          Could not load calibration data. Check your connection and refresh.
        </div>
      )}

      <CalibrationForm pumpId={pumpId} nozzles={nozzles} onRecorded={showHistoryFor} />

      <CalibrationHistory history={history} nozzles={nozzles} />
    </div>
  )
}
