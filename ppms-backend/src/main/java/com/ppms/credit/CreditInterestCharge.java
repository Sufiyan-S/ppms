package com.ppms.credit;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Represents one interest charge event applied to a credit client.
 *
 * Interest is simple — calculated as:
 *   amount = outstanding_balance × (rate_applied / 100) × (days_applied / 30)
 *
 * Interest charges are debit entries in the ledger — they increase the outstanding balance,
 * just like credit sales do. Stored separately from shift_credit_entries so they can be
 * identified, audited, and waived independently.
 */
@Entity
@Table(name = "credit_interest_charges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditInterestCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    /** Calculated interest amount for this period. */
    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    /** Outstanding balance at the moment the calculation was run (audit trail). */
    @Column(name = "outstanding_balance", nullable = false)
    private BigDecimal outstandingBalance;

    /** Snapshot of the rate that was applied (in case rate changes later). */
    @Column(name = "rate_applied", nullable = false)
    private BigDecimal rateApplied;

    /** Number of calendar days this charge covers. */
    @Column(name = "days_applied", nullable = false)
    private Integer daysApplied;

    /** Start of the period covered by this charge (inclusive). */
    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    /** End of the period covered by this charge (inclusive). */
    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    /** MANUAL = owner triggered via API; WEEKLY/MONTHLY_SCHEDULED = automated run; RECALCULATED = re-charged after a backdated change. */
    @Column(name = "source", nullable = false)
    private String source;

    /** User who triggered the charge. Null for scheduled runs. */
    @Column(name = "applied_by_user_id")
    private Long appliedByUserId;

    /** Set when an owner or admin waives the charge; a waived charge stays listed but is no longer owed. */
    @Column(name = "voided_at")
    private OffsetDateTime voidedAt;

    @Column(name = "voided_by")
    private Long voidedBy;

    @Column(name = "void_reason")
    private String voidReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
