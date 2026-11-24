import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, History, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import type { Shift } from '../../types/shift'
import OpenShiftModal from './OpenShiftModal'
import CloseShiftModal from './CloseShiftModal'
import BackfillShiftModal from './BackfillShiftModal'
import { SkeletonRows } from '../../components/Skeleton'
import { LoadError } from '../../components/LoadError'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { ShiftRow } from './active/ShiftRow'
import { AllShiftsHistory } from './history/AllShiftsHistory'
import { DayViewHistory } from './history/DayViewHistory'
import { DiscrepanciesHistory } from './history/DiscrepanciesHistory'
import { AddCreditEntryModal } from './modals/AddCreditEntryModal'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { PageTabs } from '../../components/layout/PageTabs'
import { useUrlParam } from '../../components/layout/useUrlParam'

type HistoryTab = 'day' | 'all' | 'discrepancies'

/** Parameters that belong to one history view and are dropped when switching view. */
const HISTORY_VIEW_PARAMS = ['shift', 'from', 'to', 'fuel', 'type'] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function dateParam(value: string | null): string | undefined {
  return value && ISO_DATE.test(value) ? value : undefined
}

/**
 * Shift history views kept in the address so other pages can link straight to them:
 * ?shift=123, ?history=all&from=&to=&fuel=PETROL, ?history=discrepancies&from=&to=&type=SHORT.
 */
function useHistoryFilters() {
  const [searchParams] = useSearchParams()
  const shiftText = searchParams.get('shift')
  const historyText = searchParams.get('history')
  const tab: HistoryTab = shiftText !== null && /^\d+$/.test(shiftText) ? 'all'
    : historyText === 'all' || historyText === 'discrepancies' ? historyText : 'day'
  const typeText = searchParams.get('type')

  return {
    tab,
    from: dateParam(searchParams.get('from')),
    to: dateParam(searchParams.get('to')),
    discrepancyType: typeText === 'SHORT' || typeText === 'OVER' ? typeText as 'SHORT' | 'OVER' : undefined,
    linkedFromElsewhere: shiftText !== null || historyText !== null,
  }
}

function activeShiftColumns(t: TFunction<['shifts', 'common']>): DataTableColumn<Shift>[] {
  return [
    { key: 'nozzle', header: t('page.columns.nozzle') },
    { key: 'operator', header: t('page.columns.operator') },
    { key: 'window', header: t('page.columns.window'), className: 'hidden md:table-cell' },
    { key: 'started', header: t('page.columns.started'), className: 'hidden md:table-cell' },
    { key: 'prices', header: t('page.columns.prices'), className: 'hidden md:table-cell' },
    { key: 'status', header: t('page.columns.status') },
    { key: 'actions', header: <span className="sr-only">{t('page.columns.actions')}</span> },
  ]
}

export default function ShiftsPage() {
  const { t } = useTranslation(['shifts', 'common'])
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canOpenShift  = canPerformAction('shift:open', user?.role)
  const canCloseShift = canPerformAction('shift:close', user?.role)
  const canViewDiscrepancies = canPerformAction('shift:view-discrepancies', user?.role)
  const seesOnlyOwnShifts = user?.role === 'OPERATOR'
  const historyTabIds: HistoryTab[] = canViewDiscrepancies ? ['day', 'all', 'discrepancies'] : ['day', 'all']
  const historyTabs = historyTabIds.map((id) => ({ id, label: t(`page.tabs.${id}`) }))

  const pumpId = usePumpStore((state) => state.selectedPumpId)
  const openShiftAction = useUrlParam('action')
  const showOpenModal = openShiftAction.value === 'open-shift' && canOpenShift
  const [showBackfillModal, setShowBackfillModal] = useState(false)
  const [shiftToClose,      setShiftToClose]      = useState<Shift | null>(null)
  const [shiftToHandOver,   setShiftToHandOver]   = useState<Shift | null>(null)
  const [shiftIdForCredit,  setShiftIdForCredit]  = useState<number | null>(null)
  const [closedShiftPrefill, setClosedShiftPrefill] = useState<{ duId: number; nozzleIds: number[] } | null>(null)
  const historyFilters = useHistoryFilters()
  const historyTab = historyFilters.tab === 'discrepancies' && !canViewDiscrepancies ? 'day' : historyFilters.tab
  const historyRef = useRef<HTMLElement>(null)
  const [linkedOnLoad] = useState(historyFilters.linkedFromElsewhere)

  useEffect(() => {
    if (linkedOnLoad) historyRef.current?.scrollIntoView?.({ block: 'start' })
  }, [linkedOnLoad])

  const { data: rawPumps = [], isLoading: pumpsLoading } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })

  const { data: activeShifts = [], isLoading: activeLoading, isLoadingError: activeLoadFailed, refetch: refetchActive, isFetching: activeFetching, dataUpdatedAt: activeUpdatedAt } = useQuery({
    queryKey:      ['activeShifts', pumpId],
    queryFn:       () => shiftApi.getActiveShifts(pumpId!),
    enabled:       !!pumpId,
    refetchInterval: 60_000,
  })

  if (isOwnerOrAdmin && !pumpsLoading && rawPumps.length === 0) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning p-6 text-center">
          <p className="text-warn-strong font-medium mb-2">{t('page.noPumpsTitle')}</p>
          <p className="text-warn text-sm mb-4">
            {t('page.noPumpsBody')}
          </p>
          <Link to="/dashboard/setup"
            className="ui-btn ui-btn-primary inline-flex">
            {t('page.goToSetup')}
          </Link>
        </div>
      </Page>
    )
  }

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  const selectedPump = rawPumps.find((p) => p.id === pumpId)
  const shiftForCredit = activeShifts.find((shift) => shift.id === shiftIdForCredit) ?? null
  const closeOpenShiftModal = () => {
    openShiftAction.remove()
    setClosedShiftPrefill(null)
  }

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pumpId && !activeLoading && (
          <StatusBadge tone={activeShifts.length > 0 ? 'ok' : 'neutral'} icon={Zap} label={t('page.openNowCount', { count: activeShifts.length })} />
        )}
        secondaryActions={isOwnerOrAdmin && pumpId && (
          <button
            type="button"
            onClick={() => setShowBackfillModal(true)}
            className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5"
            title={t('page.backfillHint')}
          >
            <History size={14} strokeWidth={2} aria-hidden="true" />
            {t('page.backfillShift')}
          </button>
        )}
        primaryAction={canOpenShift && pumpId && (
          <button
            type="button"
            onClick={() => openShiftAction.set('open-shift')}
            className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('page.openShift')}
          </button>
        )}
      />

      {!pumpId ? (
        <div className="ui-card text-center text-sm text-ink-3">
          {t('common:notices.noPump')}
        </div>
      ) : (
        <>
          <PageSection
            title={seesOnlyOwnShifts ? t('page.myActiveShifts') : t('page.activeShifts')}
            titleMeta={<RefreshIndicator isFetching={activeFetching} dataUpdatedAt={activeUpdatedAt ?? 0} />}
            actions={selectedPump && <span className="text-xs text-ink-3">{selectedPump.name}</span>}
            flush
          >
            {activeLoading ? (
              <div className="px-5 py-4"><SkeletonRows count={3} /></div>
            ) : activeLoadFailed ? (
              <LoadError onRetry={() => void refetchActive()} className="m-4" />
            ) : activeShifts.length === 0 ? (
              <div className="ui-empty rounded-none border-0 p-6">
                {canOpenShift
                  ? t('page.emptyCanOpen')
                  : seesOnlyOwnShifts
                  ? t('page.emptyOperator')
                  : t('page.empty')}
              </div>
            ) : (
              <DataTable
                caption={t('page.activeShiftsCaption')}
                captionHidden
                columns={activeShiftColumns(t)}
                rows={activeShifts}
                rowKey={(shift) => shift.id}
                cardsOnPhone
                className="rounded-none border-0"
                renderRow={(shift) => (
                  <ShiftRow
                    shift={shift}
                    onClose={canCloseShift ? () => setShiftToClose(shift) : undefined}
                    onHandOver={canCloseShift ? () => setShiftToHandOver(shift) : undefined}
                    onAddCredit={() => setShiftIdForCredit(shift.id)}
                  />
                )}
              />
            )}
          </PageSection>

          <PageSection ref={historyRef} title={seesOnlyOwnShifts ? t('page.myShiftHistory') : t('page.shiftHistory')} flush>
            <PageTabs label={t('page.historyViews')} tabs={historyTabs} activeTab={historyTab} param="history" resetParams={HISTORY_VIEW_PARAMS} />
            <div key={historyTab} className="ui-tab-content">
              {historyTab === 'day' ? (
                <DayViewHistory pumpId={pumpId} />
              ) : historyTab === 'discrepancies' ? (
                <DiscrepanciesHistory
                  key={`${historyFilters.from}|${historyFilters.to}|${historyFilters.discrepancyType}`}
                  pumpId={pumpId}
                  initialFrom={historyFilters.from}
                  initialTo={historyFilters.to}
                  initialType={historyFilters.discrepancyType}
                />
              ) : (
                <AllShiftsHistory pumpId={pumpId} />
              )}
            </div>
          </PageSection>
        </>
      )}

      {showOpenModal && pumpId && (
        <OpenShiftModal
          pumpId={pumpId}
          activeShifts={activeShifts}
          onClose={closeOpenShiftModal}
          prefilledDuId={closedShiftPrefill?.duId}
          prefilledNozzleIds={closedShiftPrefill?.nozzleIds}
        />
      )}
      {showBackfillModal && pumpId && (
        <BackfillShiftModal
          pumpId={pumpId}
          onClose={() => setShowBackfillModal(false)}
        />
      )}
      {shiftToClose && (
        <CloseShiftModal
          shift={shiftToClose}
          onClose={() => setShiftToClose(null)}
          onOpenNextShift={canOpenShift ? (duId, nozzleIds) => {
            setShiftToClose(null)
            setClosedShiftPrefill({ duId, nozzleIds })
            openShiftAction.set('open-shift')
          } : undefined}
        />
      )}
      {shiftToHandOver && (
        <CloseShiftModal
          shift={shiftToHandOver}
          onClose={() => setShiftToHandOver(null)}
          handoverActiveShifts={activeShifts}
        />
      )}
      {shiftForCredit && (
        <AddCreditEntryModal
          shift={shiftForCredit}
          onClose={() => setShiftIdForCredit(null)}
        />
      )}
    </Page>
  )
}
