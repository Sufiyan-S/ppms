import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { superAdminApi } from '../../api/superAdminApi'
import type { OnboardOwnerResponse } from '../../api/superAdminApi'
import client from '../../api/client'
import { KpiRow } from '../../components/layout/DashboardGrid'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { AnimatedCount } from './AnimatedCount'
import { CreatedOwnerCard } from './CreatedOwnerCard'
import { OnboardOwnerPage } from './OnboardOwnerPage'
import { OwnersList } from './OwnersList'
import { SuperAdminHeader } from './SuperAdminHeader'

const ONBOARD_ACTION = 'onboard-owner'

function PlatformTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="ui-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink"><AnimatedCount value={value} /></p>
    </div>
  )
}

export default function SuperAdminPage() {
  const { t } = useTranslation('superadmin')
  const [, setSearchParams] = useSearchParams()
  const action = useUrlParam('action')
  const isOnboarding = action.value === ONBOARD_ACTION
  const [createdOwner, setCreatedOwner] = useState<OnboardOwnerResponse | null>(null)
  // Password is stored in a ref — not in React state — so it never appears in
  // React DevTools. It is wiped immediately after the super admin copies it.
  const createdPasswordRef = useRef<string | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const showPassword = revealedPassword !== null

  const { data: owners = [], isLoading: ownersLoading } = useQuery({
    queryKey: ['superadmin-owners'],
    queryFn: superAdminApi.listOwners,
  })

  const { data: analytics } = useQuery({
    queryKey: ['superadmin-analytics'],
    queryFn: () => client.get('/super-admin/analytics').then(r => r.data),
  })

  const dismissCreatedOwner = () => {
    setCreatedOwner(null)
    createdPasswordRef.current = null
    setRevealedPassword(null)
  }

  // Auto-clear the credential panel after 2 minutes to limit plaintext password exposure
  useEffect(() => {
    if (!createdOwner) return
    const timer = setTimeout(() => {
      setCreatedOwner(null)
      createdPasswordRef.current = null
      setRevealedPassword(null)
    }, 2 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [createdOwner])

  const showCreatedOwner = (owner: OnboardOwnerResponse, password: string) => {
    createdPasswordRef.current = password
    setCreatedOwner(owner)
    setRevealedPassword(null)
    setSearchParams({ owner: String(owner.ownerId) }, { replace: true })
  }

  const handleCopyCredentials = () => {
    if (!createdOwner || !createdPasswordRef.current) return
    const text = t('page.copiedCredentials', { phone: createdOwner.phoneNumber, password: createdPasswordRef.current, pump: createdOwner.pumpName })
    navigator.clipboard.writeText(text)
    // Wipe the password from memory immediately after copying — one-time copy only
    dismissCreatedOwner()
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SuperAdminHeader />

      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        <Page>
          {isOnboarding ? (
            <OnboardOwnerPage ownersPath="/super-admin" onSubmitStart={dismissCreatedOwner} onCreated={showCreatedOwner} />
          ) : (
            <>
              <PageHeader
                title={t('page.title')}
                description={t('page.description')}
                primaryAction={(
                  <button type="button" onClick={() => action.set(ONBOARD_ACTION)} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
                    <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                    {t('onboard.title')}
                  </button>
                )}
              />

              {createdOwner && (
                <CreatedOwnerCard
                  createdOwner={createdOwner}
                  revealedPassword={revealedPassword}
                  onToggleReveal={() => setRevealedPassword(showPassword ? null : createdPasswordRef.current)}
                  onCopy={handleCopyCredentials}
                  onDismiss={dismissCreatedOwner}
                />
              )}

              {analytics && (
                <KpiRow label={t('page.totalsLabel')} columns={3}>
                  <PlatformTotal label={t('page.pumpOwners')} value={analytics.totalOwners} />
                  <PlatformTotal label={t('page.pumps')} value={analytics.totalPumps} />
                  <PlatformTotal label={t('page.staffMembers')} value={analytics.totalStaff} />
                </KpiRow>
              )}

              <OwnersList owners={owners} ownersLoading={ownersLoading} />
            </>
          )}
        </Page>
      </main>
    </div>
  )
}
