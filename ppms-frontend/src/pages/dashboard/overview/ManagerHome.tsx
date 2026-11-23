import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, Truck, Wallet, Zap, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Shift } from '../../../types/shift'
import type { TankStock } from '../../../api/inventoryApi'
import { useAuthStore } from '../../../store/authStore'
import { canPerformAction } from '../../../permissions/permissions'
import { roleLabel } from '../../../constants/labels'
import { MoneyText } from '../../../components/AmountText'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { useNow } from '../../../hooks/useNow'
import { RefreshIndicator } from '../../../components/RefreshIndicator'
import { PageHeader } from '../../../components/layout/PageHeader'
import { PageSection } from '../../../components/layout/PageSection'
import OpenShiftModal from '../../shifts/OpenShiftModal'
import { RecordDeliveryModal } from '../../inventory/record-delivery/RecordDeliveryModal'
import { timeOpen } from './overviewFormat'

interface ManagerHeaderProps {
  pumpName: string | undefined
}

export function ManagerHeader({ pumpName }: ManagerHeaderProps) {
  const { t } = useTranslation(['dashboard', 'common'])
  const user = useAuthStore((state) => state.user)
  return (
    <PageHeader
      title={pumpName ?? t('common:notices.noPumpTitle')}
      description={`${user?.fullName ?? ''} · ${roleLabel(user?.role)}`}
    />
  )
}

interface QuickActionsProps {
  pumpId: number
  activeShifts: Shift[]
  tanks: TankStock[]
}

export function ManagerQuickActions({ pumpId, activeShifts, tanks }: QuickActionsProps) {
  const { t } = useTranslation(['dashboard', 'common'])
  const role = useAuthStore((state) => state.user?.role)
  const [openShiftVisible, setOpenShiftVisible] = useState(false)
  const [deliveryVisible, setDeliveryVisible] = useState(false)

  return (
    <section aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="sr-only">{t('manager.quickActions')}</h2>
      <div className="grid grid-cols-2 gap-3">
        {canPerformAction('shift:open', role) && (
          <QuickActionButton icon={Zap} label={t('manager.openShift')} onClick={() => setOpenShiftVisible(true)} />
        )}
        {canPerformAction('inventory:record-dip-check', role) && (
          <QuickActionLink icon={Gauge} label={t('manager.dipCheck')} to="/dashboard/inventory" />
        )}
        {canPerformAction('inventory:record-delivery', role) && (
          <QuickActionButton icon={Truck} label={t('manager.delivery')} onClick={() => setDeliveryVisible(true)} disabled={tanks.length === 0} />
        )}
        {canPerformAction('cash:record-event', role) && (
          <QuickActionLink icon={Wallet} label={t('manager.cashEntry')} to="/dashboard/cash" />
        )}
      </div>

      {openShiftVisible && (
        <OpenShiftModal pumpId={pumpId} activeShifts={activeShifts} onClose={() => setOpenShiftVisible(false)} />
      )}
      {deliveryVisible && (
        <RecordDeliveryModal
          pumpId={pumpId}
          tanks={tanks}
          isOwnerOrAdmin={role === 'OWNER' || role === 'ADMIN'}
          canSetBillTotal
          onClose={() => setDeliveryVisible(false)}
        />
      )}
    </section>
  )
}

const QUICK_ACTION_CLASS = 'ui-btn ui-btn-secondary min-h-14 w-full justify-start gap-2 text-sm font-semibold'

function QuickActionButton({ icon: Icon, label, onClick, disabled = false }: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${QUICK_ACTION_CLASS} disabled:opacity-50`}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      {label}
    </button>
  )
}

function QuickActionLink({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <Link to={to} className={QUICK_ACTION_CLASS}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      {label}
    </Link>
  )
}

interface OpenShiftsLiveProps {
  shifts: Shift[]
  isFetching: boolean
  dataUpdatedAt: number
}

export function OpenShiftsLive({ shifts, isFetching, dataUpdatedAt }: OpenShiftsLiveProps) {
  const { t } = useTranslation(['dashboard', 'common'])
  const now = useNow(30_000)
  return (
    <PageSection
      title={t('manager.openShifts')}
      titleMeta={<RefreshIndicator isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} />}
      flush
    >
      {shifts.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-3">{t('manager.noneOpen')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {shifts.map((shift) => {
            const creditTotal = shift.creditEntries
              .filter((entry) => entry.voidStatus === 'ACTIVE')
              .reduce((sum, entry) => sum + entry.amount, 0)
            const isOverdue = shift.status === 'OPEN_OVERDUE'
            return (
              <li key={shift.id}>
                <Link to="/dashboard/shifts" className="flex min-h-12 items-center gap-3 px-5 py-3 text-sm hover:bg-surface-sunken">
                  <span className="min-w-0 flex-1 text-ink">
                    <span className="font-semibold">{shift.operatorName}</span>
                    {' · '}{shift.duName ?? `DU ${shift.duNumber}`}
                    {' · '}{t('manager.openFor', { duration: timeOpen(shift.actualStartTime, now) })}
                    {' · '}<MoneyText value={creditTotal} /> {t('manager.credit')}
                  </span>
                  {isOverdue && (
                    <StatusBadge {...shiftStatusBadge(shift.status)} className="shrink-0" />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PageSection>
  )
}
