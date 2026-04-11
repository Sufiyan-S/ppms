package com.ppms.ancillary;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * FIFO inventory lot for ancillary products.
 * One lot is created per stock delivery. Sales deduct from the oldest ACTIVE lot first.
 * When remaining_quantity reaches 0 the status transitions to EXHAUSTED.
 */
@Entity
@Table(name = "ancillary_stock_lots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillaryStockLot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "delivery_id", nullable = false)
    private Long deliveryId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "original_quantity", nullable = false)
    private Integer originalQuantity;

    /** Decremented as sales consume units from this lot. Must never go negative. */
    @Column(name = "remaining_quantity", nullable = false)
    private Integer remainingQuantity;

    /** Cost price captured at delivery time — locked in for COGS calculation. */
    @Column(name = "cost_price_per_unit", nullable = false, precision = 12, scale = 2)
    private BigDecimal costPricePerUnit;

    /** Determines FIFO order — oldest delivery date is consumed first. */
    @Column(name = "delivery_date", nullable = false)
    private LocalDate deliveryDate;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private AncillaryLotStatus status = AncillaryLotStatus.ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
