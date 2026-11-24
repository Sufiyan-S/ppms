import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { BarChart2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { pumpApi } from '../../api/pumpApi'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { ListDetail } from '../../components/layout/ListDetail'
import { BalanceSheetList } from './BalanceSheetList'
import { DeleteConfirmModal } from './DeleteConfirmModal'
import type { DeletableSheet } from './DeleteConfirmModal'
import { DetailPanel } from './DetailPanel'
import { GenerateModal } from './GenerateModal'
import { useBalanceSheetList } from './useBalanceSheetList'

const GENERATE_ACTION = 'generate-sheet'

/**
 * Sheets in a date range beside the sheet named in ?sheet= (desktop) or on its own screen (phone).
 * ?action=generate-sheet opens the Generate form.
 */
export default function BalanceSheetPage() {
  const { t } = useTranslation(['balancesheet', 'common'])
  const { user } = useAuthStore()
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canView   = canManage || user?.role === 'MANAGER'

  const { selectedPumpId: pumpId } = usePumpStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deleteTarget, setDeleteTarget] = useState<DeletableSheet | null>(null)
  const sheetText = searchParams.get('sheet')
  const selectedId = sheetText && /^\d+$/.test(sheetText) ? Number(sheetText) : null
  const showGenerateModal = searchParams.get('action') === GENERATE_ACTION && Boolean(pumpId)
  const sheetList = useBalanceSheetList(pumpId)

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''

  const updateParams = (change: (params: URLSearchParams) => void, replace: boolean) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    change(updated)
    return updated
  }, { replace })

  const searchFor = (sheetId: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('sheet', String(sheetId))
    return `?${params.toString()}`
  }

  const openGenerate = () => updateParams((params) => params.set('action', GENERATE_ACTION), false)
  const closeGenerate = () => updateParams((params) => params.delete('action'), true)
  const openGeneratedSheet = (sheetId: number) => updateParams((params) => {
    params.delete('action')
    params.set('sheet', String(sheetId))
  }, true)
  const closeSheet = () => updateParams((params) => params.delete('sheet'), false)

  if (!canView) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('list.noPermission')}
        </div>
      </Page>
    )
  }

  const generateButton = (
    <button
      type="button"
      onClick={openGenerate}
      disabled={!pumpId}
      className="ui-btn ui-btn-primary inline-flex items-center gap-1.5 disabled:opacity-40"
    >
      <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
      {t('list.generateSheet')}
    </button>
  )

  const list = <BalanceSheetList pumpId={pumpId} list={sheetList} selectedId={selectedId} searchFor={searchFor} />

  const placeholder = (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <BarChart2 size={40} strokeWidth={1.5} aria-hidden="true" className="text-ink-3" />
      <p className="text-sm font-medium text-ink">{t('list.selectReport')}</p>
      <p className="max-w-sm text-xs text-ink-3">{t('list.selectReportHint')}</p>
      {pumpId && generateButton}
    </div>
  )

  return (
    <Page>
      <div className="print:hidden">
        <PageHeader
          title={t('list.title')}
          description={t('list.description')}
          badges={pumpId && <RefreshIndicator isFetching={sheetList.query.isFetching} dataUpdatedAt={sheetList.query.dataUpdatedAt ?? 0} />}
          primaryAction={generateButton}
        />
      </div>

      {!pumpId ? (
        <div className="ui-empty">{t('common:notices.noPump')}</div>
      ) : (
        <div className="ui-card overflow-hidden p-0 print:overflow-visible print:border-0 print:[&>div]:block print:[&>div>nav]:hidden">
          <ListDetail
            listLabel={t('list.listLabel')}
            detailLabel={t('list.detailLabel')}
            list={list}
            selectedId={selectedId}
            detail={selectedId !== null && (
              <DetailPanel
                key={selectedId}
                pumpId={pumpId}
                reportId={selectedId}
                onClose={closeSheet}
                canDelete={canManage}
                onDelete={(sheet) => { setDeleteTarget(sheet); closeSheet() }}
                onRegenerated={(newId) => updateParams((params) => params.set('sheet', String(newId)), true)}
                pumpName={pumpName}
              />
            )}
            placeholder={placeholder}
            onBack={closeSheet}
          />
        </div>
      )}

      {showGenerateModal && pumpId && (
        <GenerateModal pumpId={pumpId} onClose={closeGenerate} onGenerated={openGeneratedSheet} />
      )}

      {deleteTarget && pumpId && (
        <DeleteConfirmModal
          report={deleteTarget}
          pumpId={pumpId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </Page>
  )
}
