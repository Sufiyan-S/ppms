import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { superAdminApi } from '../../api/superAdminApi'
import type { OnboardOwnerResponse } from '../../api/superAdminApi'
import { Reveal } from '../../components/Reveal'
import client from '../../api/client'
import { AnimatedCount } from './AnimatedCount'
import { CreatedOwnerCard } from './CreatedOwnerCard'
import { OnboardOwnerForm } from './OnboardOwnerForm'
import { OwnersList } from './OwnersList'
import { SuperAdminHeader } from './SuperAdminHeader'

// ── Page component ────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const [createdOwner, setCreatedOwner] = useState<OnboardOwnerResponse | null>(null)
  // Password is stored in a ref — not in React state — so it never appears in
  // React DevTools. It is wiped immediately after the super admin copies it.
  const createdPasswordRef = useRef<string | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const showPassword = revealedPassword !== null

  // Fetch existing owners
  const { data: owners = [], isLoading: ownersLoading } = useQuery({
    queryKey: ['superadmin-owners'],
    queryFn: superAdminApi.listOwners,
  })

  // Platform analytics
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
  }

  const handleCopyCredentials = () => {
    if (!createdOwner || !createdPasswordRef.current) return
    const text = `PPMS Login Credentials\nPhone: ${createdOwner.phoneNumber}\nPassword: ${createdPasswordRef.current}\nPump: ${createdOwner.pumpName}`
    navigator.clipboard.writeText(text)
    // Wipe the password from memory immediately after copying — one-time copy only
    dismissCreatedOwner()
  }


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SuperAdminHeader />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main id="main-content" tabIndex={-1} className="flex-1 p-6 overflow-y-auto focus:outline-none">
        <div className="max-w-6xl mx-auto">
          <h1 className="sr-only">Platform administration</h1>

          {/* ── Platform analytics strip ───────────────────────────────────── */}
          {analytics && (
            <Reveal delay={60}>
            <div className="mb-6 ui-summary-strip">
              <div className="ui-summary-strip__item">
                <span className="ui-summary-strip__label">Pump Owners</span>
                <span className="ui-summary-strip__value"><AnimatedCount value={analytics.totalOwners} /></span>
              </div>
              <div className="ui-summary-strip__item">
                <span className="ui-summary-strip__label">Pumps</span>
                <span className="ui-summary-strip__value"><AnimatedCount value={analytics.totalPumps} /></span>
              </div>
              <div className="ui-summary-strip__item">
                <span className="ui-summary-strip__label">Staff Members</span>
                <span className="ui-summary-strip__value"><AnimatedCount value={analytics.totalStaff} /></span>
              </div>
            </div>
            </Reveal>
          )}

          {/* ── Credentials card (shown after successful onboarding) ───────── */}
          {createdOwner && (
            <CreatedOwnerCard
              createdOwner={createdOwner}
              revealedPassword={revealedPassword}
              onToggleReveal={() => setRevealedPassword(showPassword ? null : createdPasswordRef.current)}
              onCopy={handleCopyCredentials}
              onDismiss={dismissCreatedOwner}
            />
          )}

          {/* ── 2-column layout ────────────────────────────────────────────── */}
          <Reveal delay={130}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* ── Left: Onboard form ──────────────────────────────────────── */}
            <OnboardOwnerForm onSubmitStart={dismissCreatedOwner} onCreated={showCreatedOwner} />

            <OwnersList owners={owners} ownersLoading={ownersLoading} />
          </div>
          </Reveal>
        </div>
      </main>

    </div>
  )
}
