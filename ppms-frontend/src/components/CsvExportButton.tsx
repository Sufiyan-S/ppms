import { useState } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { downloadCsv } from '../utils/csv'
import type { CsvColumn } from '../utils/csv'

/**
 * "Export CSV" next to Print; a polite live region tells screen-reader users the file was saved.
 * rows can be a loader when the table on screen shows only one page of what should be exported.
 */
export function CsvExportButton<Row>({ filename, columns, rows, disabled = false }: {
  filename: string
  columns: CsvColumn<Row>[]
  rows: Row[] | (() => Promise<Row[]>)
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const exported = typeof rows === 'function' ? await rows() : rows
      downloadCsv(filename, columns, exported)
      setStatus(t('csvExport.exported', { count: exported.length, filename }))
    } catch (error) {
      console.error(`Could not export ${filename}`, error)
      setStatus(t('csvExport.failed', { filename }))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled || exporting || (Array.isArray(rows) && rows.length === 0)}
        aria-busy={exporting}
        className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5 print:hidden"
      >
        <Download size={14} strokeWidth={2} aria-hidden="true" />
        {t('actions.exportCsv')}
      </button>
      <span role="status" className="sr-only">{status}</span>
    </>
  )
}
