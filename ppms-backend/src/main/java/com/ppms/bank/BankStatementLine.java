package com.ppms.bank;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A single transaction line from an imported bank statement.
 *
 * match_status lifecycle: UNMATCHED → MATCHED (linked to a shift/sale/payment)
 *                                  → IGNORED  (owner decided it is not relevant)
 *
 * debit_amount: money leaving the account (funds transferred out, charges).
 * credit_amount: money entering the account (UPI receipts, refunds).
 * Both default to 0 — only one is non-zero per line for standard bank statements.
 *
 * utr_reference: Unique Transaction Reference from NEFT/UPI/RTGS — used for matching.
 */
@Entity
@Table(name = "bank_statement_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankStatementLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "import_id", nullable = false)
    private Long importId;

    @Column(name = "txn_date", nullable = false)
    private LocalDate txnDate;

    @Column(name = "narration")
    private String narration;

    @Column(name = "debit_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal debitAmount;

    @Column(name = "credit_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal creditAmount;

    @Column(name = "balance", precision = 14, scale = 2)
    private BigDecimal balance;

    @Column(name = "utr_reference", length = 100)
    private String utrReference;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "match_status", nullable = false)
    private BankLineMatchStatus matchStatus;

    /** FK to shifts — if this credit entry corresponds to a UPI shift collection. */
    @Column(name = "matched_shift_id")
    private Long matchedShiftId;

    /** FK to ancillary_sales — if this is an ancillary product sale receipt. */
    @Column(name = "matched_ancillary_sale_id")
    private Long matchedAncillarySaleId;

    /** FK to credit_payments — if this credit is a customer credit payment. */
    @Column(name = "matched_payment_id")
    private Long matchedPaymentId;

    @Column(name = "match_notes")
    private String matchNotes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        if (matchStatus == null) matchStatus = BankLineMatchStatus.UNMATCHED;
        if (debitAmount == null) debitAmount = BigDecimal.ZERO;
        if (creditAmount == null) creditAmount = BigDecimal.ZERO;
    }
}
