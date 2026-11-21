import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { calibrationApi } from '../../api/calibrationApi'

export function useCalibrationHistory(pumpId: number | null) {
  // History filter — independent from the form nozzle selector
  const [historyNozzleId, setHistoryNozzleId] = useState<number>(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const { data: calibrationsPage, isLoading, error: calibrationsError } = useQuery({
    queryKey:  ['calibrations', pumpId, historyNozzleId, historyPage, historyPageSize],
    queryFn:   () => historyNozzleId
      ? calibrationApi.getCalibrations(pumpId!, historyNozzleId, historyPage, historyPageSize)
      : calibrationApi.getPumpCalibrations(pumpId!, historyPage, historyPageSize),
    enabled:   !!pumpId,
  })

  const calibrations = calibrationsPage?.content
  const filteredCalibrations = useMemo(() => {
    return (calibrations ?? []).filter(c => {
      if (fromDate && c.calibrationDate < fromDate) return false
      if (toDate   && c.calibrationDate > toDate)   return false
      return true
    })
  }, [calibrations, fromDate, toDate])

  return {
    calibrationsPage, calibrations, isLoading, calibrationsError, filteredCalibrations,
    historyNozzleId, setHistoryNozzleId,
    setHistoryPage, setHistoryPageSize,
    fromDate, setFromDate,
    toDate, setToDate,
  }
}

export type CalibrationHistoryState = ReturnType<typeof useCalibrationHistory>
