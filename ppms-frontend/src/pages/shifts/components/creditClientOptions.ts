import type { CreditClientSummary, CreditClientStanding } from '../../../api/pumpApi'
import { formatCurrency } from '../../../utils/format'
import i18n from '../../../i18n'

export interface CreditClientOption {
  client: CreditClientSummary
  /** Why a credit sale for this client would be refused; null when it can be picked. */
  blockReason: string | null
  availableText: string | null
}

const MIN_PHONE_DIGITS = 3

export function optionElementId(listboxId: string, clientId: number) {
  return `${listboxId}-option-${clientId}`
}

/** Root accounts whose name contains the search text or whose phone contains the typed digits. */
export function matchingRootClients(clients: CreditClientSummary[], search: string): CreditClientSummary[] {
  const text = search.trim().toLowerCase()
  const digits = search.replace(/\D/g, '')
  return clients.filter((client) => client.parentClientId === null && (
    client.name.toLowerCase().includes(text)
    || (digits.length >= MIN_PHONE_DIGITS && (client.phone ?? '').replace(/\D/g, '').includes(digits))
  ))
}

/**
 * Shift close records credit already given, where the server checks only the limit,
 * so blockOverdue is false there; a mid-shift sale is also refused for an overdue cycle.
 */
export function toClientOption(
  client: CreditClientSummary,
  standing: CreditClientStanding | undefined,
  blockOverdue: boolean,
): CreditClientOption {
  const availableText = standing?.availableCredit != null
    ? i18n.t('shifts:clientSearch.available', { amount: formatCurrency(standing.availableCredit) })
    : null
  switch (standing?.creditStatus) {
    case 'INACTIVE':
      return { client, availableText: null, blockReason: client.isActive ? i18n.t('shifts:clientSearch.blocked.parentDisabled') : i18n.t('shifts:clientSearch.blocked.creditDisabled') }
    case 'OVER_LIMIT':
      return { client, availableText, blockReason: i18n.t('shifts:clientSearch.blocked.overLimit') }
    case 'OVERDUE':
      return { client, availableText, blockReason: blockOverdue ? i18n.t('shifts:clientSearch.blocked.cycleOverdue') : null }
    default:
      return { client, availableText, blockReason: null }
  }
}
