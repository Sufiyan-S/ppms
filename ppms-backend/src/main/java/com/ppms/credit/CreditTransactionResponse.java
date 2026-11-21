package com.ppms.credit;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Represents a single line in the client's ledger — either a credit sale (DEBIT)
 * or a payment received (CREDIT). Both flow through the same timeline view.
 */
@Data
@Builder
public class CreditTransactionResponse {

    // "SALE" or "PAYMENT"
    private String type;

    private Long referenceId;

    // For SALE: bill number from the shift entry. For PAYMENT: notes.
    private String reference;

    // For SALE: the fuel type. For PAYMENT: the payment mode.
    private String detail;

    // Positive amount for the event (sign is conveyed by `type`)
    private BigDecimal amount;

    // Running balance after this transaction (positive = client owes money)
    private BigDecimal runningBalance;

    private OffsetDateTime occurredAt;

    // Business (IST) date the transaction belongs to; for payments the date the client paid
    private LocalDate businessDate;

    // ACTIVE / VOIDED for sales, APPROVED / PENDING_APPROVAL / REJECTED for payments, ACTIVE for interest
    private String status;

    // False for voided sales and non-approved payments; such rows are listed but leave the running balance unchanged
    private boolean countedInBalance;

    // Set only by the full-history endpoint, which can return a parent's rows together with its sub-accounts'
    private Long clientId;

    private String clientName;
}
