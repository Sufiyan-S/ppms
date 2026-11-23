import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/layout/PageHeader'
import { useAuthStore } from '../../../store/authStore'
import { roleLabel } from '../../../constants/labels'
import { formatIstDate } from '../../../utils/date'

/** One line of context for owners and accountants: where they are looking, who they are and the date. */
export function OverviewHeader({ focusName, children }: { focusName: string | undefined; children?: ReactNode }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const user = useAuthStore((state) => state.user)
  const today = formatIstDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <PageHeader
      title={focusName ?? t('common:notices.noPumpTitle')}
      description={`${user?.fullName ?? ''} · ${roleLabel(user?.role)} · ${today}`}
      secondaryActions={children}
    />
  )
}
