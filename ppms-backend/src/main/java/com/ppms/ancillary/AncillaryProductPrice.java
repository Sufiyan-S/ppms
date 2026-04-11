package com.ppms.ancillary;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Immutable price history record — one row per price-change event per product.
 * The most recent row (by effective_from DESC) is the current selling price.
 * Never updated once inserted; mirrors the GlobalFuelPrice pattern.
 */
@Entity
@Table(name = "ancillary_product_prices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillaryProductPrice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "price_per_unit", nullable = false, precision = 12, scale = 2)
    private BigDecimal pricePerUnit;

    @Column(name = "effective_from", nullable = false)
    private OffsetDateTime effectiveFrom;

    @Column(name = "set_by_user_id", nullable = false)
    private Long setByUserId;

    @PrePersist
    protected void onCreate() {
        if (effectiveFrom == null) {
            effectiveFrom = OffsetDateTime.now();
        }
    }
}
