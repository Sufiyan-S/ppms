import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { CreateShiftDefinitionRequest } from '../../../api/shiftDefinitionApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { subtractOneMinute, TIME_OPTS, SORT_ORDER_OPTS, defaultRows } from './shiftDefinitionRows'
import type { ShiftRow } from './shiftDefinitionRows'

export function CreateShiftBatchForm({ pumpId, onClose }: { pumpId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [hasEndDate, setHasEndDate] = useState(false)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [rows, setRows] = useState<ShiftRow[]>(defaultRows)
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (reqs: CreateShiftDefinitionRequest[]) =>
      shiftDefinitionApi.createBatch(pumpId, reqs),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-definitions', pumpId] })
      qc.invalidateQueries({ queryKey: ['shift-definitions-active', pumpId] })
      onClose()
    },
    onError: (err) => {
      setFormError(parseApiError(err, 'Failed to save shift definitions'))
    },
  })

  const addRow = () => {
    if (rows.length >= 4) return
    setRows(prev => [
      ...prev,
      { name: '', startTime: '06:00', endTime: '14:00', isNightShift: false, sortOrder: prev.length + 1 },
    ])
  }

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const updateRow = (idx: number, patch: Partial<ShiftRow>) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const handleSubmit = () => {
    setFormError(null)
    if (!effectiveFrom) { setFormError('Start date (Effective From) is required'); return }
    if (hasEndDate && !effectiveTo) { setFormError('End date is required when "Has end date" is checked'); return }
    if (hasEndDate && effectiveTo <= effectiveFrom) { setFormError('End date must be after the start date'); return }
    if (rows.some(r => !r.name.trim())) { setFormError('Each shift must have a name'); return }

    // Guard: only the night shift is allowed to cross midnight (endTime < startTime).
    // If a non-night shift has end < start, the user almost certainly picked AM instead of PM.
    const badRow = rows.find(r => !r.isNightShift && r.endTime <= r.startTime)
    if (badRow) {
      setFormError(
        `"${badRow.name}" ends before it starts. Only the Night shift can cross midnight. Did you select AM instead of PM?`
      )
      return
    }

    // End times are exclusive upper bounds: store "end - 1 min" so consecutive shifts
    // can share a boundary (e.g., Night ends displayed as 9:00 AM, Morning starts at 9:00 AM).
    const resolvedEffectiveTo = hasEndDate ? effectiveTo : null
    const reqs: CreateShiftDefinitionRequest[] = rows.map(r => ({
      name: r.name.trim(),
      startTime: r.startTime,
      endTime: subtractOneMinute(r.endTime),
      isNightShift: r.isNightShift,
      sortOrder: r.sortOrder,
      effectiveFrom,
      effectiveTo: resolvedEffectiveTo,
    }))
    createMutation.mutate(reqs)
  }

  return (
    <div className="ui-card-plain p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">New Shift Schedule</h3>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block">
            <span className="ui-label">Start Date <span className="text-red-400">*</span></span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="text-sm"
            />
          </label>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ui-label mb-0">End Date</span>
            <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={hasEndDate}
                onChange={e => { setHasEndDate(e.target.checked); if (!e.target.checked) setEffectiveTo('') }}
                className="w-3 h-3 accent-blue-600"
              />
              Set end date
            </label>
          </div>
          <input aria-label="End date"
            type="date"
            value={effectiveTo}
            onChange={e => setEffectiveTo(e.target.value)}
            disabled={!hasEndDate}
            min={effectiveFrom || undefined}
            className="text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
          {!hasEndDate && (
            <p className="text-xs text-slate-500 mt-1">Open-ended — no expiry date</p>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Any previously open schedule will be automatically closed on the day before the start date.
        You cannot create two schedules with overlapping date ranges.
      </p>

      {/* Shift rows */}
      <div className="space-y-3">
        {rows.map((row, idx) => {
          const otherRows = rows.filter((_, i) => i !== idx)
          // Only block times used by rows that have been named — unnamed rows have default
          // placeholder times that should not restrict other rows' options.
          const configuredOtherRows = otherRows.filter(r => r.name.trim() !== '')
          const usedStarts = new Set(configuredOtherRows.map(r => r.startTime))
          const usedEnds   = new Set(configuredOtherRows.map(r => r.endTime))
          const startOpts  = TIME_OPTS.filter(o => !usedStarts.has(o.value))
          const endOpts    = TIME_OPTS.filter(o => !usedEnds.has(o.value))
          return (
          <div key={idx} className="grid gap-2 items-center md:grid-cols-[minmax(0,12rem)_minmax(8.5rem,1fr)_auto_minmax(8.5rem,1fr)_minmax(6.5rem,7.5rem)_auto]">
            <input aria-label="Shift name"
              placeholder="Name (e.g. Morning)"
              value={row.name}
              onChange={e => updateRow(idx, { name: e.target.value })}
              className="min-w-0 text-sm md:max-w-[12rem]"
            />
            <SearchableSelect label="Start time"
              value={row.startTime}
              onChange={v => updateRow(idx, { startTime: v })}
              options={startOpts}
              size="sm"
              className="min-w-0"
            />
            <span className="text-xs text-slate-500">→</span>
            <SearchableSelect label="End time"
              value={row.endTime}
              onChange={v => updateRow(idx, { endTime: v })}
              options={endOpts}
              size="sm"
              className="min-w-0"
            />
            <SearchableSelect label="Display order"
              value={String(row.sortOrder)}
              onChange={v => updateRow(idx, { sortOrder: Number(v) })}
              options={SORT_ORDER_OPTS}
              size="sm"
              className="min-w-0"
            />
            <div className="flex items-center gap-1.5">
              <input
                id={`night-${idx}`}
                type="checkbox"
                checked={row.isNightShift}
                onChange={e => updateRow(idx, { isNightShift: e.target.checked })}
                className="w-3.5 h-3.5 accent-indigo-600"
              />
              <label htmlFor={`night-${idx}`} className="text-xs text-slate-600 select-none">Night</label>
              {rows.length > 1 && (
                <IconButton onClick={() => removeRow(idx)} className="ui-btn ui-btn-ghost ml-1 text-base leading-none text-red-400 hover:text-red-600"
                  label="Remove row"
                  icon={'×'}
                />
              )}
            </div>
          </div>
          )
        })}
      </div>

      {rows.length < 4 && (
        <button
          type="button"
          onClick={addRow}
          className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
        >
          + Add another shift
        </button>
      )}

      {formError && <p role="alert" className="ui-error-text">{formError}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {createMutation.isPending ? 'Saving…' : 'Save Schedule'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ui-btn ui-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
