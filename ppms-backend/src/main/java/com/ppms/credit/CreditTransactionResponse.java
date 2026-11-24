package com.ppms.credit;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Represents a single line in the client's ledger — a fuel or counter credit sale or an interest
 * charge (DEBIT), or a payment received (CREDIT). All flow through the same timeline view.
 */
@Data
@Builder
public class CreditTransactionResponse {

    // "SALE" (fuel), "COUNTER_SALE" (shop product), "PAYMENT" or "INTEREST"
    private String type;

    private Long referenceId;

    // For SALE: the entry description. For COUNTER_SALE: product, quantity and bill number. For PAYMENT: notes.
    private String reference;

    // Names the reference for translated screens when the server wrote it (COUNTER_SALE, INTEREST, unknown payment recorder), filled with referenceParams
    private String referenceCode;

    @Builder.Default
    private Map<String, Object> referenceParams = Map.of();

    // For SALE: the fuel type. For PAYMENT: the payment mode.
    private String detail;

    // Positive amount for the event (sign is conveyed by `type`)
    private BigDecimal amount;

    // Running balance after this transaction (positive = client owes money)
    private BigDecimal runningBalance;

    private OffsetDateTime occurredAt;

    // Business (IST) date the transaction belongs to; for payments the date the client paid
    private LocalDate businessDate;

    // ACTIVE / VOIDED for sales, APPROVED / PENDING_APPROVAL / REJECTED for payments, ACTIVE / WAIVED for interest
    private String status;

    // False for voided sales, non-approved payments and waived interest; such rows are listed but leave the running balance unchanged
    private boolean countedInBalance;

    // Set only by the full-history endpoint, which can return a parent's rows together with its sub-accounts'
    private Long clientId;

    private String clientName;
}
