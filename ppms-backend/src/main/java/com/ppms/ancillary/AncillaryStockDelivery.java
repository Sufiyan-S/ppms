package com.ppms.ancillary;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Represents a physical stock-in event — supplier delivers a batch of units.
 * Each delivery creates one AncillaryStockLot for FIFO cost tracking.
 */
@Entity
@Table(name = "ancillary_stock_deliveries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillaryStockDelivery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    /** Whole units delivered — no fractional units allowed. */
    @Column(name = "quantity_units", nullable = false)
    private Integer quantityUnits;

    /** Cost price paid per unit to the supplier. Used for COGS calculation. */
    @Column(name = "cost_price_per_unit", nullable = false, precision = 12, scale = 2)
    private BigDecimal costPricePerUnit;

    @Column(name = "delivery_date", nullable = false)
    private LocalDate deliveryDate;

    @Column(name = "invoice_reference", length = 100)
    private String invoiceReference;

    @Column(name = "notes")
    private String notes;

    @Column(name = "logged_by_user_id", nullable = false)
    private Long loggedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
