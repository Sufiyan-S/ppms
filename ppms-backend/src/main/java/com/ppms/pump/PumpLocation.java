package com.ppms.pump;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pump_locations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PumpLocation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "address", nullable = false)
    private String address;

    @Column(name = "max_nozzle_count", nullable = false)
    private Integer maxNozzleCount;

    @Column(name = "manager_id")
    private Long managerId;

    @Column(name = "admin_id")
    private Long adminId;

    /**
     * Discrepancy amount above which the resolution requires Owner approval.
     * If null, any role with permission may resolve discrepancies without restriction.
     * Configured per-pump in Setup.
     */
    @Column(name = "discrepancy_escalation_threshold")
    private BigDecimal discrepancyEscalationThreshold;

    /**
     * Expense amount above which an OPERATOR/MANAGER-submitted expense requires Owner/Admin approval.
     * Expenses at or below this threshold are auto-approved.
     * If null, all expenses are auto-approved.
     */
    @Column(name = "expense_approval_threshold")
    private BigDecimal expenseApprovalThreshold;

    /**
     * When false, this pump is hidden from the owner's dashboard.
     * Staff (ADMIN, MANAGER, OPERATOR) assigned directly to this pump are not affected —
     * they continue to access it via their assignedPumpId.
     * Only SuperAdmin can toggle this flag.
     */
    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private boolean enabled = true;

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
