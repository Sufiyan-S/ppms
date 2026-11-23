package com.ppms.adjustment;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records physical fuel removal from the tank for maintenance or testing purposes
 * (e.g., "20 L removed to clean nozzle filter"). Not counted through the nozzle meter.
 * The litres leave the tank's stock and oldest lots; the loss is their purchase cost and is
 * subtracted from gross profit in balance sheets. Can be recorded at any time by Admin/Owner.
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

    /** Null for entries recorded before drains left tank stock. */
    @Column(name = "tank_id")
    private Long tankId;

    @Column(name = "fuel_type", nullable = false)
    private String fuelType;

    /** Litres physically removed from the tank. */
    @Column(name = "litres_removed", nullable = false)
    private BigDecimal litresRemoved;

    /**
     * Average purchase cost per litre of the lots the fuel was drawn from. Entries recorded before drains
     * left tank stock hold the selling price at the time instead.
     */
    @Column(name = "price_per_unit", nullable = false)
    private BigDecimal pricePerUnit;

    /** Cost of the fuel lost: the purchase cost of the litres drawn from the lots (selling value on older entries). */
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
