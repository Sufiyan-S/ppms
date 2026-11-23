import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvFilename, downloadCsv, toCsv } from './csv'
import type { CsvColumn } from './csv'

interface Row {
  name: string
  amount: number | null
  date: string
}

const columns: CsvColumn<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Amount (₹)', value: (row) => row.amount, kind: 'money' },
  { header: 'Date', value: (row) => row.date, kind: 'date' },
]

describe('toCsv', () => {
  it('starts with a UTF-8 byte order mark and ends each line with CRLF', () => {
    const csv = toCsv(columns, [{ name: 'Diesel', amount: 10, date: '2026-10-01' }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('Name,Amount (₹),Date\r\nDiesel,10.00,2026-10-01\r\n')
  })

  it('writes amounts as plain numbers with two decimals and blanks for missing values', () => {
    const csv = toCsv(columns, [
      { name: 'A', amount: 125248.5, date: '2026-10-01' },
      { name: 'B', amount: -3.456, date: '2026-10-01' },
      { name: 'C', amount: null, date: '2026-10-01' },
    ])
    expect(csv).toContain('A,125248.50,')
    expect(csv).toContain('B,-3.46,')
    expect(csv).toContain('C,,2026-10-01')
  })

  it('writes instants as their IST date', () => {
    const csv = toCsv(columns, [{ name: 'Late', amount: 1, date: '2026-10-31T19:00:00Z' }])
    expect(csv).toContain('Late,1.00,2026-11-01')
  })

  it('quotes cells with commas, quotes or line breaks and doubles inner quotes', () => {
    const csv = toCsv(columns, [{ name: 'Ravi "RK", Pune\nNight', amount: 1, date: '2026-10-01' }])
    expect(csv).toContain('"Ravi ""RK"", Pune\nNight",1.00,2026-10-01')
  })

  it('stops typed text from running as a spreadsheet formula', () => {
    const csv = toCsv(columns, [{ name: '=HYPERLINK("x")', amount: 1, date: '2026-10-01' }])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('csvFilename', () => {
  it('names the report and its period', () => {
    expect(csvFilename('pl', { from: '2026-10-01', to: '2026-10-31' })).toBe('ppms-pl-2026-10-01_2026-10-31.csv')
    expect(csvFilename('audit')).toBe('ppms-audit.csv')
  })
})

describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks())

  it('downloads the file under the given name', () => {
    const createObjectURL = vi.fn(() => 'blob:csv')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadCsv('ppms-pl.csv', columns, [])

    expect(click).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
