import { istDateString } from './date'

export type CsvValue = string | number | null | undefined

/**
 * money: written as a plain number with 2 decimals (no ₹, no grouping) so spreadsheets can sum it.
 * date:  a YYYY-MM-DD date, or an instant written as its IST date.
 */
export interface CsvColumn<Row> {
  header: string
  value: (row: Row) => CsvValue
  kind?: 'text' | 'number' | 'money' | 'date'
}

const BYTE_ORDER_MARK = '﻿'
// Text typed by staff (descriptions, names) must not run as a spreadsheet formula when the file is opened.
const FORMULA_START = /^[=+\-@\t\r]/

function formatCell(value: CsvValue, kind: CsvColumn<unknown>['kind']): string {
  if (value === null || value === undefined || value === '') return ''
  if (kind === 'money') return Number(value).toFixed(2)
  if (kind === 'date') {
    const text = String(value)
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : istDateString(new Date(text))
  }
  if (typeof value === 'string' && FORMULA_START.test(value)) return `'${value}`
  return String(value)
}

function escapeCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The CSV text, starting with a byte order mark so Excel reads it as UTF-8. Rows end with CRLF. */
export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [
    columns.map((column) => escapeCell(column.header)),
    ...rows.map((row) => columns.map((column) => escapeCell(formatCell(column.value(row), column.kind)))),
  ]
  return BYTE_ORDER_MARK + lines.map((cells) => cells.join(',')).join('\r\n') + '\r\n'
}

/** A file name like ppms-pl-2026-10-01_2026-10-31.csv, or ppms-audit.csv without a range. */
export function csvFilename(name: string, range?: { from?: string; to?: string }): string {
  const period = range?.from && range?.to ? `-${range.from}_${range.to}` : ''
  return `ppms-${name}${period}.csv`
}

export function downloadCsv<Row>(filename: string, columns: CsvColumn<Row>[], rows: Row[]): void {
  const blob = new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
