package com.ppms.shift;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Entity
@Table(name = "shifts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Shift {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Column(name = "operator_id", nullable = false)
    private Long operatorId;

    @Column(name = "opened_by_user_id", nullable = false)
    private Long openedByUserId;

    @Column(name = "closed_by_user_id")
    private Long closedByUserId;

    /**
     * FK to the pump_shift_definition that was active when this shift was opened.
     * Retained permanently so historical reports remain accurate even when the
     * admin later reconfigures the shift schedule.
     */
    @Column(name = "shift_definition_id")
    private Long shiftDefinitionId;

    /**
     * Snapshot of the definition's name at open time (e.g. "Night Shift").
     * Stored so the display name is preserved if the definition is later renamed.
     */
    @Column(name = "shift_name", length = 100)
    private String shiftName;

    /**
     * Snapshot of the definition's isNightShift flag at open time.
     * Used by payroll calculations to apply the correct hourly rate without
     * a join back to the definition table.
     */
    @Column(name = "is_night_shift", nullable = false)
    @Builder.Default
    private Boolean isNightShift = false;

    @Column(name = "shift_date", nullable = false)
    private LocalDate shiftDate;

    @Column(name = "actual_start_time", nullable = false)
    private OffsetDateTime actualStartTime;

    @Column(name = "actual_end_time")
    private OffsetDateTime actualEndTime;

    // ── Payment breakdown (reported by operator at close) ──────────────────

    @Column(name = "cash_collected")
    private BigDecimal cashCollected;

    @Column(name = "upi_collected")
    private BigDecimal upiCollected;

    @Column(name = "card_collected")
    private BigDecimal cardCollected;

    // Initialised to ZERO so Hibernate never sends an explicit NULL on INSERT.
    // The DB column is NOT NULL DEFAULT 0 but PostgreSQL only applies the default
    // when the column is omitted entirely — an explicit NULL overrides it.
    @Column(name = "fleet_card_collected")
    @Builder.Default
    private BigDecimal fleetCardCollected = BigDecimal.ZERO;

    @Column(name = "credit_total")
    private BigDecimal creditTotal;

    // ── Totals computed at close ───────────────────────────────────────────

    @Column(name = "total_amount_due")
    private BigDecimal totalAmountDue;

    // ── Discrepancy ────────────────────────────────────────────────────────

    @Column(name = "discrepancy_amount")
    private BigDecimal discrepancyAmount;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "discrepancy_type")
    private DiscrepancyType discrepancyType;

    @Column(name = "discrepancy_reason")
    private String discrepancyReason;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "discrepancy_resolution")
    private DiscrepancyResolution discrepancyResolution;

    @Column(name = "discrepancy_resolution_note")
    private String discrepancyResolutionNote;

    @Column(name = "discrepancy_resolved_by_id")
    private Long discrepancyResolvedById;

    @Column(name = "discrepancy_resolved_at")
    private OffsetDateTime discrepancyResolvedAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private ShiftStatus status;

    @Column(name = "is_overdue_flag", nullable = false)
    private Boolean isOverdueFlag;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
