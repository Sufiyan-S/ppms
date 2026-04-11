package com.ppms.adjustment;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records physical fuel removal from the tank for maintenance or testing purposes
 * (e.g., "20 L removed to clean nozzle filter"). Not counted through the nozzle meter.
 * Treated as an operational loss — subtracted from gross profit in balance sheets.
 * Can be recorded at any time by Admin/Owner.
 */
@Entity
@Table(name = "fuel_dip_entries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FuelDipEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    /** Litres physically removed from the tank. */
    @Column(name = "litres_removed", nullable = false)
    private BigDecimal litresRemoved;

    /** Price per litre at the time of recording — snapshotted so balance sheet is historically accurate. */
    @Column(name = "price_per_unit", nullable = false)
    private BigDecimal pricePerUnit;

    /** Monetary loss = litresRemoved × pricePerUnit, calculated at creation time. */
    @Column(name = "monetary_loss", nullable = false)
    private BigDecimal monetaryLoss;

    @Column(name = "reason", nullable = false)
    private String reason;

    /** Business date this dip belongs to — used to match balance sheet period. */
    @Column(name = "dip_date", nullable = false)
    private LocalDate dipDate;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
