package com.ppms.ancillary;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Records how many units were consumed from a specific FIFO lot for a given sale.
 * A single sale may create multiple consumption records if it spans more than one lot.
 * The cost_price_per_unit here is the lot's cost at the time of delivery — used for COGS.
 */
@Entity
@Table(name = "ancillary_lot_consumptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillaryLotConsumption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lot_id", nullable = false)
    private Long lotId;

    @Column(name = "sale_id", nullable = false)
    private Long saleId;

    @Column(name = "quantity_consumed", nullable = false)
    private Integer quantityConsumed;

    /** Cost price from the lot at delivery time — locked in for COGS reporting. */
    @Column(name = "cost_price_per_unit", nullable = false, precision = 12, scale = 2)
    private BigDecimal costPricePerUnit;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
