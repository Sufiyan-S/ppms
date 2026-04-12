package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One physical nozzle (pipe) on a Dispensary Unit.
 *
 * A nozzle carries exactly ONE fuel type — there are no sub-outlets.
 * nozzle_number is 1–9 within its parent DU.
 * last_reading is updated every time a shift closes, providing the pre-fill
 * value when the next shift is opened on this nozzle.
 * max_meter_value is the rollover threshold (default 99 999 999.999).
 */
@Entity
@Table(name = "nozzles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Nozzle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "du_id", nullable = false)
    private Long duId;

    /** Position on the DU, 1–9. */
    @Column(name = "nozzle_number", nullable = false)
    private Integer nozzleNumber;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    /**
     * Latest meter counter reading.
     * Updated at every shift close. Used as the opening reading for the next shift.
     */
    @Column(name = "last_reading", nullable = false)
    @Builder.Default
    private BigDecimal lastReading = BigDecimal.ZERO;

    /**
     * Meter rollover threshold. When the counter reaches this value it wraps to zero.
     * Default: 99 999 999.999 (8 integer digits + 3 decimal places).
     */
    @Column(name = "max_meter_value", nullable = false)
    @Builder.Default
    private BigDecimal maxMeterValue = new BigDecimal("99999999.999");

    /**
     * The underground tank this nozzle draws from.
     * Nullable — null means not yet mapped. Shift-open is blocked while null.
     */
    @Column(name = "tank_id")
    private Long tankId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private NozzleStatus status = NozzleStatus.ACTIVE;

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
