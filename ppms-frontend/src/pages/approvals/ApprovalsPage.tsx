import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvalApi } from '../../api/approvalApi'
import type { ApprovalDecisionResult, ApprovalItem } from '../../api/approvalApi'
import { usePumpStore } from '../../store/usePumpStore'
import { useNow } from '../../hooks/useNow'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { RejectReasonDialog } from '../../components/RejectReasonDialog'
import { parseApiError, translatedErrorCode } from '../../utils/apiError'
import { formatCurrency } from '../../utils/format'
import { withToggled } from '../../utils/setToggle'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'
import { ApprovalsTable } from './ApprovalsTable'
import { approvalKey } from './approvalFormat'

type KindFilter = 'all' | 'expenses' | 'payments'

const KIND_FILTERS: KindFilter[] = ['all', 'expenses', 'payments']

function kindFilterOf(value: string | null): KindFilter {
  return value === 'expenses' || value === 'payments' ? value : 'all'
}

function matchesKind(item: ApprovalItem, filter: KindFilter) {
  if (filter === 'expenses') return item.kind === 'EXPENSE'
  if (filter === 'payments') return item.kind === 'CREDIT_PAYMENT'
  return true
}

function outcomeText(t: TFunction<['approvals', 'common']>, action: 'APPROVED' | 'REJECTED', result: ApprovalDecisionResult) {
  const approved = action === 'APPROVED'
  const done = t(approved ? 'outcome.approved' : 'outcome.rejected', { count: result.succeeded })
  if (result.failed === 0) return done
  return `${done} ${t(approved ? 'outcome.notApproved' : 'outcome.notRejected', { count: result.failed })}`
}

/** Expenses and credit payments waiting for an Owner or Admin, decided one by one or many at once. */
export default function ApprovalsPage() {
  const { t } = useTranslation(['approvals', 'common'])
  const pumpId = usePumpStore(state => state.selectedPumpId)
  const qc = useQueryClient()
  const now = useNow(60_000)
  const [searchParams, setSearchParams] = useSearchParams()
  const kindFilter = kindFilterOf(searchParams.get('kind'))
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ text: string; failures: string[] } | null>(null)

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['approvals', pumpId],
    queryFn: () => approvalApi.getPending(pumpId!),
    enabled: pumpId != null,
  })

  const shown = items.filter(item => matchesKind(item, kindFilter))
  const selected = shown.filter(item => selectedKeys.has(approvalKey(item)) && item.blockedReason === null)
  const shownTotal = shown.reduce((sum, item) => sum + item.amount, 0)
  const selectedTotal = selected.reduce((sum, item) => sum + item.amount, 0)

  const decision = useMutation({
    mutationFn: ({ action, reason }: { action: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      approvalApi.decide(pumpId!, selected.map(({ kind, id }) => ({ kind, id })), action, reason),
    onSuccess: (result, { action }) => {
      const itemByKey = new Map(items.map(item => [approvalKey(item), item]))
      setOutcome({
        text: outcomeText(t, action, result),
        failures: result.results.filter(item => !item.succeeded).map(item => {
          const source = itemByKey.get(approvalKey(item))
          const name = source
            ? t(source.kind === 'EXPENSE' ? 'outcome.expenseName' : 'outcome.paymentName', { amount: formatCurrency(source.amount) })
            : `#${item.id}`
          return `${name}: ${translatedErrorCode(item.code, item.params) ?? item.message ?? t('outcome.notSaved')}`
        }),
      })
      setSelectedKeys(new Set())
      setRejecting(false)
      for (const key of ['approvals', 'expenses', 'credit-pending-payments', 'credit-ledger', 'attention']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (err, { action }) => {
      const message = parseApiError(err, action === 'APPROVED' ? t('errors.approveFailed') : t('errors.rejectFailed'))
      if (action === 'REJECTED') setRejectError(message)
      else setOutcome({ text: message, failures: [] })
    },
  })

  const setKindFilter = (value: KindFilter) => {
    setSelectedKeys(new Set())
    setSearchParams(value === 'all' ? {} : { kind: value }, { replace: true })
  }

  const toggleAll = () => {
    const selectable = shown.filter(item => item.blockedReason === null)
    const everySelected = selectable.every(item => selectedKeys.has(approvalKey(item)))
    setSelectedKeys(everySelected ? new Set() : new Set(selectable.map(approvalKey)))
  }

  const bulkActions = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-ink-2">
        {selected.length > 0 ? t('selection.summary', { count: selected.length, amount: formatCurrency(selectedTotal) }) : t('selection.hint')}
      </p>
      <button type="button" className="ui-btn ui-btn-danger" disabled={selected.length === 0 || decision.isPending}
        onClick={() => { setRejectError(null); setRejecting(true) }}>
        {t('selection.reject')}
      </button>
      <button type="button" className="ui-btn ui-btn-primary" disabled={selected.length === 0 || decision.isPending}
        onClick={() => decision.mutate({ action: 'APPROVED' })}>
        {decision.isPending && !rejecting ? <span className="flex items-center gap-1.5"><Spinner />{t('selection.approving')}</span> : t('selection.approve')}
      </button>
    </div>
  )

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pumpId != null && !isLoading && !isError && (
          <>
            <StatusBadge tone={shown.length > 0 ? 'warn' : 'neutral'} label={t('page.waitingCount', { count: shown.length })} />
            {shown.length > 0 && <StatusBadge tone="neutral" label={formatCurrency(shownTotal)} />}
          </>
        )}
      />

      <div role="status" aria-live="polite"
        className={!outcome ? 'sr-only' : `ui-alert text-sm ${outcome.failures.length > 0 ? 'ui-alert-warning' : 'ui-alert-success'}`}>
        {outcome && (
          <>
            <p>{outcome.text}</p>
            {outcome.failures.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {outcome.failures.map(failure => <li key={failure}>{failure}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {pumpId == null ? (
        <div className="ui-card"><EmptyState icon="generic" title={t('common:notices.noPumpTitle')} subtitle={t('page.noPumpSubtitle')} /></div>
      ) : (
        <PageSection title={t('page.queue')} actions={shown.length > 0 && bulkActions} flush>
          <FilterBar label={t('filters.label')}>
            {KIND_FILTERS.map(filter => (
              <button key={filter} type="button" aria-pressed={kindFilter === filter}
                onClick={() => setKindFilter(filter)} className="ui-chip">
                {t(`filters.${filter}`)}
              </button>
            ))}
          </FilterBar>
          {isLoading ? (
            <div className="px-5 py-4"><SkeletonTable rows={4} cols={6} /></div>
          ) : isError ? (
            <div role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{t('errors.loadFailed')}</div>
          ) : shown.length === 0 ? (
            <EmptyState icon="generic" title={t('page.emptyTitle')} subtitle={t('page.emptySubtitle')} />
          ) : (
            <ApprovalsTable items={shown} selectedKeys={selectedKeys} now={now}
              onToggle={item => setSelectedKeys(previous => withToggled(previous, approvalKey(item)))}
              onToggleAll={toggleAll} />
          )}
        </PageSection>
      )}

      {rejecting && (
        <RejectReasonDialog
          title={t('rejectDialog.title', { count: selected.length })}
          subtitle={t('rejectDialog.subtitle', { amount: formatCurrency(selectedTotal) })}
          isPending={decision.isPending}
          error={rejectError}
          onConfirm={reason => decision.mutate({ action: 'REJECTED', reason })}
          onClose={() => setRejecting(false)}
        />
      )}
    </Page>
  )
}
