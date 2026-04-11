package com.ppms.inventory;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "inventory_lots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryLot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Null for DIP upward adjustment lots (no delivery triggered them). */
    @Column(name = "tanker_delivery_id")
    private Long tankerDeliveryId;

    @Column(name = "tank_id", nullable = false)
    private Long tankId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    /**
     * FIFO deduction is scoped to pump + fuelType (not per individual tank).
     * Nozzles are not assigned to specific tanks, so they draw from the pump's
     * total available stock of a given fuel type across all its tanks.
     */
    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "original_quantity", nullable = false)
    private BigDecimal originalQuantity;

    @Column(name = "remaining_quantity", nullable = false)
    private BigDecimal remainingQuantity;

    /** Zero for DIP adjustment lots. */
    @Column(name = "cost_price_per_unit", nullable = false)
    private BigDecimal costPricePerUnit;

    /** Determines FIFO order — oldest delivery date is consumed first. */
    @Column(name = "delivery_date", nullable = false)
    private OffsetDateTime deliveryDate;

    @Column(name = "is_dip_adjustment", nullable = false)
    private Boolean isDipAdjustment;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private LotStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
