import { translateKey } from '../../i18n'
import { formatIstDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'

/** The short WhatsApp message sent with a statement, in the sender's language: who it is for, the period and what is owed. */
export function statementMessage(clientName: string, fromDate: string, toDate: string, outstanding: number) {
  return translateKey('credit:statement.whatsappMessage', {
    clientName,
    fromDate: formatIstDate(fromDate),
    toDate: formatIstDate(toDate),
    outstanding: formatCurrency(outstanding),
  })
}
