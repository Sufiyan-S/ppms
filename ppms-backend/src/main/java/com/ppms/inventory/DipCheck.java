package com.ppms.inventory;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "dip_checks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DipCheck {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "tank_id", nullable = false)
    private Long tankId;

    @Column(name = "measured_quantity", nullable = false)
    private BigDecimal measuredQuantity;

    @Column(name = "system_stock", nullable = false)
    private BigDecimal systemStock;

    // DB-generated column: measured_quantity - system_stock — never written by JPA
    @Column(name = "variance", insertable = false, updatable = false)
    private BigDecimal variance;

    @Column(name = "notes")
    private String notes;

    @Column(name = "checked_at", nullable = false)
    private OffsetDateTime checkedAt;

    @Column(name = "logged_by_user_id", nullable = false)
    private Long loggedByUserId;

    // The operator who physically took the dipstick reading (optional — may differ from logged_by_user_id)
    @Column(name = "checked_by_user_id")
    private Long checkedByUserId;

    /**
     * Workflow status for above-tolerance variances.
     * WITHIN_TOLERANCE: variance <= dipTolerance — no action needed.
     * PENDING_REVIEW:   variance > dipTolerance — awaiting Owner/Admin acknowledgement.
     * REVIEWED:         Owner/Admin has acknowledged the variance.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private DipCheckStatus status;

    /** User who reviewed an above-tolerance DIP check. Null for WITHIN_TOLERANCE checks. */
    @Column(name = "reviewed_by_user_id")
    private Long reviewedByUserId;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
