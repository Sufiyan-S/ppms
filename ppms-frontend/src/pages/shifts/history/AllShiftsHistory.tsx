import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import { MoneyText } from '../../../components/AmountText'
import { Pagination } from '../../../components/Pagination'
import { SkeletonRows } from '../../../components/Skeleton'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { FilterBar } from '../../../components/layout/FilterBar'
import { ListDetail } from '../../../components/layout/ListDetail'
import { codeLabel } from '../../../constants/labels'
import { useDateRangeParams } from '../../../hooks/useDateRangeParams'
import type { PagedResponse } from '../../../types/paged'
import type { Shift } from '../../../types/shift'
import { parseApiError } from '../../../utils/apiError'
import { localDateInputValue } from '../../../utils/date'
import { PAGE_SIZE } from '../shiftLabels'
import { ShiftDetail } from './ShiftDetail'

const lastTwoDays = () => ({ from: localDateInputValue(-1), to: localDateInputValue() })

function ShiftListItem({ shift, search, selected }: { shift: Shift; search: string; selected: boolean }) {
  const { t } = useTranslation(['shifts', 'common'])
  return (
    <Link to={{ search }} aria-current={selected ? 'page' : undefined} className="ui-list-item">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{t('common:shiftNumber', { id: shift.id })} · {shift.operatorName}</span>
        <span className="block text-xs text-ink-3">
          {shift.duName ?? t('common:duNumber', { number: shift.duNumber })} · {shift.shiftDate}{shift.shiftWindow ? ` · ${shift.shiftWindow}` : ''}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <MoneyText value={shift.totalAmountDue} className="text-sm font-semibold text-ink" />
        <StatusBadge {...shiftStatusBadge(shift.status)} />
      </span>
    </Link>
  )
}

/**
 * Every shift in a date range as a list, with the shift named in ?shift= open beside it (desktop) or on its own screen.
 * from, to and fuel come from the address too, e.g. a "View shifts" link on the P&L report.
 */
export function AllShiftsHistory({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['shifts', 'common'])
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useDateRangeParams(lastTwoDays)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const fuelText = searchParams.get('fuel')
  const fuelType = fuelText && /^[A-Z_]+$/.test(fuelText) ? fuelText : undefined
  const shiftText = searchParams.get('shift')
  const selectedId = shiftText && /^\d+$/.test(shiftText) ? Number(shiftText) : null

  const { data, isLoading, error } = useQuery({
    queryKey: ['shiftHistory', pumpId, 'all', range.from, range.to, fuelType, page, pageSize],
    queryFn:  () => shiftApi.getShiftHistoryPage(pumpId, { from: range.from || undefined, to: range.to || undefined, fuelType }, page, pageSize),
    placeholderData: keepPreviousData,
  })

  const shifts        = data?.content ?? []
  const totalElements = data?.page.totalElements ?? 0
  const totalPages    = Math.max(1, data?.page.totalPages ?? 1)
  const safePage      = Math.min(page, totalPages - 1)
  const pageData: PagedResponse<Shift> = {
    content: shifts,
    page: safePage,
    pageSize,
    totalElements,
    totalPages,
    hasNext: safePage < totalPages - 1,
    hasPrevious: safePage > 0,
  }
  const isFiltered    = Boolean(range.from || range.to || fuelType)

  const updateParams = (change: (params: URLSearchParams) => void, replace: boolean) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    change(updated)
    return updated
  }, { replace })

  const changeDate = (name: 'from' | 'to', value: string) => {
    setRange({ ...range, [name]: value })
    setPage(0)
  }
  const clearFilters = () => {
    updateParams((params) => { params.set('from', ''); params.set('to', ''); params.delete('fuel') }, true)
    setPage(0)
  }
  const searchFor = (shiftId: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('history', 'all')
    params.set('shift', String(shiftId))
    return `?${params.toString()}`
  }

  const list = (
    <>
      <FilterBar
        label={t('history.filtersLabel')}
        onClearFilters={clearFilters}
        hasActiveFilters={isFiltered}
        summary={`${t('history.shiftCount', { count: totalElements })}${isFiltered ? t('history.filtered') : ''}`}
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          <input aria-label={t('common:fields.fromDate')} type="date" value={range.from}
            onChange={(e) => changeDate('from', e.target.value)} className="min-w-[8.5rem] flex-1 text-xs" />
          <span className="text-xs text-ink-3">{t('history.to')}</span>
          <input aria-label={t('common:fields.toDate')} type="date" value={range.to}
            onChange={(e) => changeDate('to', e.target.value)} className="min-w-[8.5rem] flex-1 text-xs" />
        </div>
        {fuelType && (
          <button type="button" onClick={() => updateParams((params) => params.delete('fuel'), true)} className="ui-chip" aria-pressed="true"
            aria-label={t('history.fuelOnlyLabel', { fuel: codeLabel(fuelType) })}>
            {t('history.fuelOnly', { fuel: codeLabel(fuelType) })}
          </button>
        )}
      </FilterBar>

      {isLoading ? (
        <div className="px-4 py-3"><SkeletonRows count={4} /></div>
      ) : error ? (
        <p role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{parseApiError(error, t('history.loadFailed'))}</p>
      ) : shifts.length === 0 ? (
        <p className="ui-empty m-4">{t('history.allEmpty')}</p>
      ) : (
        <ul>
          {shifts.map((shift) => (
            <li key={shift.id}>
              <ShiftListItem shift={shift} search={searchFor(shift.id)} selected={shift.id === selectedId} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        data={pageData}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
      />
    </>
  )

  return (
    <ListDetail
      listLabel={t('history.listLabel')}
      detailLabel={t('history.detailLabel')}
      list={list}
      selectedId={selectedId}
      detail={selectedId !== null && <ShiftDetail pumpId={pumpId} shiftId={selectedId} />}
      placeholder={<p className="ui-empty">{t('history.selectShift')}</p>}
      onBack={() => updateParams((params) => params.delete('shift'), false)}
    />
  )
}
