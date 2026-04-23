package com.ppms.settlement;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a single digital payment settlement — the actual bank credit for a given day.
 *
 * settlement_date is the date the funds arrived in the bank account (not when this record
 * was created). Partial settlements are allowed: Admin can record ₹5,000 settled on Monday
 * and ₹3,000 on Tuesday for the same period's collections.
 *
 * The "wallet balance" for a payment type = SUM(all shift collections) − SUM(all settlements).
 */
@Entity
@Table(name = "payment_settlements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentSettlement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_type", nullable = false)
    private SettlementPaymentType paymentType;

    /** Date the funds arrived in the bank — set explicitly by the Admin/Owner. */
    @Column(name = "settlement_date", nullable = false)
    private LocalDate settlementDate;

    @Column(name = "amount_received", nullable = false)
    private BigDecimal amountReceived;

    @Column(name = "notes")
    private String notes;

    /**
     * Cumulative wallet balance for this payment type at the moment this record was saved.
     * Null for settlements recorded before this field was introduced.
     * isPartial = amountReceived < pendingAtRecordTime (i.e. not all pending funds were settled).
     */
    @Column(name = "pending_at_record_time")
    private BigDecimal pendingAtRecordTime;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
