import client from './client'
import type { PagedResponse } from '../types/paged'

export interface CreditClient {
  id: number
  pumpId: number
  name: string
  phone: string
  notes: string | null
  creditLimit: number
  outstandingBalance: number
  /** Unpaid interest portion of the outstanding balance (interest-first allocation). Subset of outstandingBalance. */
  outstandingInterest: number
  /** Total interest covered by payments historically. */
  totalInterestRecovered: number
  /** Monthly simple interest rate in %. 0 = no interest configured. */
  monthlyInterestRate: number
  /** Days after first credit entry before interest starts. */
  interestGraceDays: number
  createdAt: string
  /** Null for root/parent accounts. Non-null when this is a sub-account. */
  parentClientId: number | null
  /** Human-readable parent name. Null for root accounts. */
  parentClientName: string | null
  /** True if this root account has sub-accounts under it. */
  isParent: boolean
}

export interface CreditTransaction {
  /** SALE is fuel on credit; COUNTER_SALE is a shop product sold on credit. */
  type: 'SALE' | 'COUNTER_SALE' | 'PAYMENT' | 'INTEREST'
  referenceId: number
  reference: string | null
  /** Set when the server wrote the reference (COUNTER_SALE and INTEREST rows, a payment by unknown staff), for translated screens. */
  referenceCode: string | null
  referenceParams: Record<string, unknown>
  detail: string | null
  amount: number
  runningBalance: number
  /** When the row was recorded; rows of the same business date are ordered by this. */
  occurredAt: string
  /** IST date (YYYY-MM-DD) the row belongs to; for a payment, the date the client paid. */
  businessDate: string
  /** ACTIVE / VOIDED for sales; APPROVED / PENDING_APPROVAL / REJECTED for payments. */
  status: string
  /** False for voided sales and non-approved payments; they leave the running balance unchanged. */
  countedInBalance: boolean
  /** Account the row belongs to; set by the full-ledger endpoint. */
  clientId?: number
  clientName?: string
}

export interface UpdateInterestSettingsRequest {
  monthlyInterestRate: number
  interestGraceDays: number
}

export interface ApplyInterestResponse {
  applied: boolean
  amount?: number
  days?: number
  periodFrom?: string
  periodTo?: string
  reason?: string
  reasonCode?: string
  reasonParams?: Record<string, unknown>
}

export interface CreditPayment {
  id: number
  clientId: number
  amount: number
  paymentMode: string
  notes: string | null
  paidAt: string
  recordedById: number
  recordedByUserName: string
  paymentApprovalStatus: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED'
  createdAt: string
}

export interface RecordPaymentRequest {
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'
  paidAt: string  // YYYY-MM-DD
  notes?: string
}

export interface UpdateCreditLimitRequest {
  creditLimit: number
}

// ── Credit extensions ─────────────────────────────────────────────────────────

export type CreditExtensionType = 'AMOUNT_EXTENSION' | 'BILLING_CYCLE_EXTENSION' | 'OVERDUE_BLOCK_WAIVER'

export interface CreditExtension {
  id: number
  pumpId: number
  clientId: number
  extensionType: CreditExtensionType
  extensionAmount: number | null
  expiryDate: string  // YYYY-MM-DD
  grantedByUserId: number
  reason: string
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  createdAt: string
}

export interface CreateExtensionRequest {
  extensionType: CreditExtensionType
  extensionAmount?: number
  expiryDate: string  // YYYY-MM-DD
  reason: string
}

// ── Credit invoices ──────────────────────────────────────────────────────────

export type CreditInvoiceStatus = 'ISSUED' | 'CANCELLED'

export interface CreditInvoice {
  id: number
  pumpId: number
  clientId: number
  /** e.g. PMP3/26-27/0001 — consecutive per financial year, never reused. */
  invoiceNumber: string
  financialYear: string
  periodFrom: string  // YYYY-MM-DD
  periodTo: string    // YYYY-MM-DD
  issuedOn: string    // YYYY-MM-DD
  sellerLegalName: string
  sellerGstin: string
  buyerName: string
  /** Null for an unregistered (B2C) client. */
  buyerGstin: string | null
  placeOfSupplyStateCode: string
  /** Fuel is outside GST (VAT included). */
  fuelTotal: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  grandTotal: number
  status: CreditInvoiceStatus
  cancelReason: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface InvoicePeriod {
  periodFrom: string  // YYYY-MM-DD
  periodTo: string    // YYYY-MM-DD
}

export interface GenerateAllInvoicesResult {
  invoicesIssued: number
  clientsSkipped: number
  clientsFailed: number
  failedClientIds: number[]
}

export type CreditStanding = 'OK' | 'OVERDUE' | 'OVER_LIMIT' | 'INACTIVE'

/** One standalone or parent account; a parent's figures cover its sub-accounts. */
export interface CreditAgingRow {
  clientId: number
  name: string
  phone: string | null
  subAccountCount: number
  billingCycle: 'WEEKLY' | 'MONTHLY'
  /** 0 = no limit. */
  creditLimit: number
  outstanding: number
  upTo30Days: number
  days31To60: number
  days61To90: number
  over90Days: number
  /** Earliest sale still carrying part of the balance (YYYY-MM-DD). */
  oldestUnpaidSaleDate: string | null
  lastPaymentDate: string | null
  /** Days past the billing cycle; 0 when not overdue. */
  daysOverdue: number
  creditStatus: CreditStanding
  pendingPaymentCount: number
  pendingPaymentAmount: number
}

export interface CreditAging {
  summary: {
    totalOutstanding: number
    overdueAmount: number
    overSixtyAmount: number
    overdueCount: number
    overLimitCount: number
    pendingApprovalCount: number
  }
  clients: CreditAgingRow[]
}

export interface InvoiceRunPreview {
  clientsToInvoice: number
  totalAmount: number
  /** False when the pump has no GSTIN, legal name or invoice prefix, so nothing can be issued. */
  gstDetailsComplete: boolean
}

export const creditApi = {
  // Returns all clients with outstanding balances
  getLedgerSummary: (pumpId: number) =>
    client.get<CreditClient[]>(`/pumps/${pumpId}/credit-ledger`).then(r => r.data),

  // Returns paginated transaction history (sales + payments + interest) for a client
  getTransactions: (pumpId: number, clientId: number, page = 0, size = 10) =>
    client.get<PagedResponse<CreditTransaction>>(`/pumps/${pumpId}/credit-ledger/${clientId}/transactions`, { params: { page, size } }).then(r => r.data),

  // The client's whole ledger in one response; for a parent, includeChildren adds its sub-accounts' rows
  getAllTransactions: (pumpId: number, clientId: number, includeChildren = false) =>
    client.get<CreditTransaction[]>(`/pumps/${pumpId}/credit-ledger/${clientId}/transactions/all`, { params: { includeChildren } }).then(r => r.data),

  getAging: (pumpId: number) =>
    client.get<CreditAging>(`/pumps/${pumpId}/credit-ledger/aging`).then(r => r.data),

  getPendingPayments: (pumpId: number) =>
    client.get<CreditPayment[]>(`/pumps/${pumpId}/credit-ledger/payments/pending`).then(r => r.data),

  approvePayment: (pumpId: number, paymentId: number, status: 'APPROVED' | 'REJECTED', reason?: string) =>
    client.patch<CreditPayment>(`/pumps/${pumpId}/credit-ledger/payments/${paymentId}/approve`, { status, reason }).then(r => r.data),

  // Records a payment against a client's balance
  recordPayment: (pumpId: number, clientId: number, req: RecordPaymentRequest) =>
    client.post<CreditPayment>(`/pumps/${pumpId}/credit-ledger/${clientId}/payments`, req).then(r => r.data),

  // Updates the credit limit for a client (0 = unlimited)
  updateCreditLimit: (pumpId: number, clientId: number, req: UpdateCreditLimitRequest) =>
    client.patch<CreditClient>(`/pumps/${pumpId}/credit-ledger/clients/${clientId}/credit-limit`, req).then(r => r.data),

  // Updates monthly interest rate and grace days for a client
  updateInterestSettings: (pumpId: number, clientId: number, req: UpdateInterestSettingsRequest) =>
    client.patch<CreditClient>(`/pumps/${pumpId}/credit-ledger/clients/${clientId}/interest-settings`, req).then(r => r.data),

  // Applies pro-rata interest for a single client up to today
  applyInterest: (pumpId: number, clientId: number) =>
    client.post<ApplyInterestResponse>(`/pumps/${pumpId}/credit-ledger/${clientId}/interest/apply`).then(r => r.data),

  // Applies pro-rata interest to ALL eligible clients for a pump
  applyInterestForAll: (pumpId: number) =>
    client.post<{
      clientsCharged:  number
      clientsSkipped:  number
      clientsFailed:   number
      failedClientIds: number[]
    }>(`/pumps/${pumpId}/credit-ledger/interest/apply-all`).then(r => r.data),

  // Waives an interest charge with a reason; the row stays on the ledger but is no longer owed (Owner/Admin only)
  waiveInterestCharge: (pumpId: number, clientId: number, chargeId: number, reason: string) =>
    client.patch(`/pumps/${pumpId}/credit-ledger/${clientId}/interest/${chargeId}/waive`, { reason }),

  // Total interest ever recovered for a client (parent = includes all sub-accounts)
  getTotalInterestRecovered: (pumpId: number, clientId: number): Promise<number> =>
    client.get(`/pumps/${pumpId}/credit-ledger/${clientId}/interest/total-recovered`)
      .then(r => r.data.totalInterestRecovered),

  // ── Credit extensions ───────────────────────────────────────────────────────

  // Lists all extensions for a client (newest first)
  getExtensions: (pumpId: number, clientId: number) =>
    client.get<CreditExtension[]>(`/pumps/${pumpId}/credit-clients/${clientId}/extensions`).then(r => r.data),

  // Returns currently active (non-expired) extensions for a client
  getActiveExtensions: (pumpId: number, clientId: number) =>
    client.get<CreditExtension[]>(`/pumps/${pumpId}/credit-clients/${clientId}/extensions/active`).then(r => r.data),

  // Grants a new credit extension (Admin/Owner only)
  createExtension: (pumpId: number, clientId: number, req: CreateExtensionRequest) =>
    client.post<CreditExtension>(`/pumps/${pumpId}/credit-clients/${clientId}/extensions`, req).then(r => r.data),

  // Withdraws an active extension before it expires, with a reason (Admin/Owner only)
  revokeExtension: (pumpId: number, clientId: number, extensionId: number, reason: string) =>
    client.post<CreditExtension>(`/pumps/${pumpId}/credit-clients/${clientId}/extensions/${extensionId}/revoke`, { reason })
      .then(r => r.data),

  // ── Credit invoices ─────────────────────────────────────────────────────────

  listInvoices: (pumpId: number, clientId: number, page = 0, size = 10) =>
    client.get<PagedResponse<CreditInvoice>>(`/pumps/${pumpId}/credit-invoices`, { params: { clientId, page, size } }).then(r => r.data),

  // The client's last completed billing cycle, used to prefill the generate form
  getDefaultInvoicePeriod: (pumpId: number, clientId: number) =>
    client.get<InvoicePeriod>(`/pumps/${pumpId}/credit-invoices/default-period`, { params: { clientId } }).then(r => r.data),

  generateInvoice: (pumpId: number, clientId: number, period: InvoicePeriod) =>
    client.post<CreditInvoice>(`/pumps/${pumpId}/credit-invoices`, { clientId, ...period }).then(r => r.data),

  previewInvoicesForAllClients: (pumpId: number, period: InvoicePeriod) =>
    client.get<InvoiceRunPreview>(`/pumps/${pumpId}/credit-invoices/generate-all/preview`, { params: period }).then(r => r.data),

  generateInvoicesForAllClients: (pumpId: number, period: InvoicePeriod) =>
    client.post<GenerateAllInvoicesResult>(`/pumps/${pumpId}/credit-invoices/generate-all`, period).then(r => r.data),

  cancelInvoice: (pumpId: number, invoiceId: number, reason: string) =>
    client.post<CreditInvoice>(`/pumps/${pumpId}/credit-invoices/${invoiceId}/cancel`, { reason }).then(r => r.data),

  // Same-origin page; the browser sends the session cookie when it is opened in a new tab
  invoicePrintUrl: (pumpId: number, invoiceId: number) =>
    `/api/pumps/${pumpId}/credit-invoices/${invoiceId}/print`,

  // Same-origin printable statement for the period, opened in a new tab
  statementUrl: (pumpId: number, clientId: number, period: { fromDate: string; toDate: string }) =>
    `/api/pumps/${pumpId}/credit-ledger/${clientId}/statement?${new URLSearchParams(period).toString()}`,
}
