package com.ppms.adjustment;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Audit record of a manual meter reading correction on a nozzle outlet.
 * Created when an Admin/Owner uses Setup → Adjust Reading (RESET or CUSTOM_READING).
 * No financial impact — purely a log entry. The outlet's lastReading is updated separately.
 */
@Entity
@Table(name = "nozzle_reading_adjustments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NozzleReadingAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Column(name = "outlet_id", nullable = false)
    private Long outletId;

    /** RESET or CUSTOM_READING */
    @Column(name = "adjustment_type", nullable = false)
    private String adjustmentType;

    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    @Column(name = "previous_reading", nullable = false)
    private BigDecimal previousReading;

    @Column(name = "new_reading", nullable = false)
    private BigDecimal newReading;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
