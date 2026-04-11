package com.ppms.payroll;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A payroll snapshot for one staff member covering a specific pay period.
 *
 * Lifecycle: DRAFT → APPROVED → PAID
 *   DRAFT    — calculated but not confirmed; Owner can edit or recalculate
 *   APPROVED — Owner has confirmed the amount; ready for payment
 *   PAID     — salary has been disbursed; record is final
 *
 * Two salary models are supported, distinguished by salary_type:
 *
 * HOURLY_SHIFT (operators):
 *   gross = shift1_hours × shift1_rate_snapshot + standard_hours × standard_rate_snapshot
 *
 * DAILY (managers, admins, accountants):
 *   gross = days_worked × daily_rate_snapshot
 *   days_worked = total calendar days in period − leave_days
 *
 * Rate snapshots are stored so the record is self-contained even if rates change later.
 */
@Entity
@Table(name = "payroll_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PayrollRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Distinguishes payroll calculation model. Defaults to HOURLY_SHIFT for operators. */
    @Column(name = "salary_type", nullable = false)
    private String salaryType;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    /** Total number of closed shifts in the period (shift1 + standard combined). */
    @Column(name = "total_shifts", nullable = false)
    private Integer totalShifts;

    /** Count of SHIFT_1 (night) shifts worked. */
    @Column(name = "shift1_shifts", nullable = false)
    private Integer shift1Shifts;

    /** Total actual hours worked across all SHIFT_1 shifts. */
    @Column(name = "shift1_hours", nullable = false)
    private BigDecimal shift1Hours;

    /** Hourly rate snapshot for SHIFT_1 at the time this record was generated. */
    @Column(name = "shift1_rate_snapshot")
    private BigDecimal shift1RateSnapshot;

    /** Count of SHIFT_2 + SHIFT_3 (day) shifts worked. */
    @Column(name = "standard_shifts", nullable = false)
    private Integer standardShifts;

    /** Total actual hours worked across all SHIFT_2 and SHIFT_3 shifts. */
    @Column(name = "standard_hours", nullable = false)
    private BigDecimal standardHours;

    /** Hourly rate snapshot for SHIFT_2/3 at the time this record was generated. */
    @Column(name = "standard_rate_snapshot")
    private BigDecimal standardRateSnapshot;

    @Column(name = "gross_amount", nullable = false)
    private BigDecimal grossAmount;

    /**
     * Total salary deductions for this pay period.
     * Sum of discrepancy_amount for shifts where discrepancy_resolution = SALARY_DEDUCTION
     * by this user in the period. Defaults to 0 (no deductions).
     */
    @Column(name = "deductions", nullable = false)
    @Builder.Default
    private BigDecimal deductions = BigDecimal.ZERO;

    /**
     * Net pay after deductions: gross_amount − deductions.
     * This is the actual amount to be disbursed to the staff member.
     */
    @Column(name = "net_pay", nullable = false)
    @Builder.Default
    private BigDecimal netPay = BigDecimal.ZERO;

    // ── DAILY salary type fields (MANAGER / ADMIN / ACCOUNTANT) ──────────────

    /** Total calendar days in the pay period (period_to − period_from + 1). */
    @Column(name = "total_days")
    private Integer totalDays;

    /** Leave days recorded for the user in the period — deducted from total_days. */
    @Column(name = "leave_days")
    private Integer leaveDays;

    /** Actual days worked: total_days − leave_days. */
    @Column(name = "days_worked")
    private Integer daysWorked;

    /** Daily rate snapshot at the time this record was generated. */
    @Column(name = "daily_rate_snapshot")
    private BigDecimal dailyRateSnapshot;

    @Column(name = "notes")
    private String notes;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private PayrollStatus status;

    @Column(name = "approved_by")
    private Long approvedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = updatedAt = OffsetDateTime.now();
        if (status == null) status = PayrollStatus.DRAFT;
        if (salaryType == null) salaryType = "HOURLY_SHIFT";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
