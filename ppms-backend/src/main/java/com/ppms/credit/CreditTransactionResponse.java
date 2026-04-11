package com.ppms.credit;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
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
}
