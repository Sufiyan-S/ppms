package com.ppms.expense;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a single operational expense at the pump (e.g., maintenance cost, salary payment).
 * Expenses are visible to Owner/Admin and feed into the balance sheet as deductions.
 */
@Entity
@Table(name = "pump_expenses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PumpExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "category", nullable = false)
    private ExpenseCategory category;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    /**
     * Full lifecycle: DRAFT → PENDING_APPROVAL → APPROVED or REJECTED.
     * DRAFT        — saved but not yet submitted; only DRAFT expenses can be deleted.
     * PENDING_APPROVAL — submitted by MANAGER/OPERATOR, waiting for Owner/Admin review.
     * APPROVED     — auto-approved (OWNER/ADMIN submission or amount ≤ threshold) or manually approved.
     * REJECTED     — declined by reviewer; excluded from all financial calculations.
     */
    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "approval_status", nullable = false)
    @Builder.Default
    private ExpenseApprovalStatus approvalStatus = ExpenseApprovalStatus.DRAFT;

    @Column(name = "approved_by_user_id")
    private Long approvedByUserId;

    @Column(name = "approved_at")
    private OffsetDateTime approvedAt;

    @Column(name = "approval_notes")
    private String approvalNotes;

    /**
     * Set when a DRAFT expense is explicitly submitted for approval.
     * NULL for expenses that were auto-approved at creation (OWNER/ADMIN fast path).
     */
    @Column(name = "submitted_by_user_id")
    private Long submittedByUserId;

    @Column(name = "submitted_at")
    private OffsetDateTime submittedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
