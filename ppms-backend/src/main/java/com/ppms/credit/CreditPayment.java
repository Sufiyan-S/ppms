package com.ppms.credit;

import com.ppms.expense.ExpenseApprovalStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a cash/UPI/bank payment received from a credit client.
 * Payments reduce the client's outstanding balance.
 *
 * High-value payments may require Owner/Admin approval before they are counted
 * in the outstanding balance. The threshold is set on pump_locations.expense_approval_threshold.
 * Payments auto-approved when the recording user is OWNER or ADMIN, or when no threshold is set,
 * or when the amount is at or below the threshold.
 */
@Entity
@Table(name = "credit_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    /** The date the payment was physically received (not the DB record date). */
    @Column(name = "payment_date", nullable = false)
    private LocalDate paidAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_mode", nullable = false)
    private PaymentMode paymentMode;

    /** Optional reference number (cheque no., NEFT ref, UPI transaction ID). */
    @Column(name = "reference_no", length = 100)
    private String referenceNo;

    @Column(name = "notes")
    private String notes;

    @Column(name = "received_by_user_id", nullable = false)
    private Long recordedById;

    /**
     * Approval status for the payment.
     * PENDING_APPROVAL: awaiting Owner/Admin review before counting in outstanding balance.
     * APPROVED: counted in outstanding balance (default for most payments).
     * REJECTED: overturned by Owner/Admin — not counted in outstanding balance.
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_approval_status", nullable = false)
    @Builder.Default
    private ExpenseApprovalStatus paymentApprovalStatus = ExpenseApprovalStatus.APPROVED;

    @Column(name = "approved_by_user_id")
    private Long approvedByUserId;

    @Column(name = "approved_at")
    private OffsetDateTime approvedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
