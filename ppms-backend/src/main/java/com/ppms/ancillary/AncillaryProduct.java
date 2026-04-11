package com.ppms.ancillary;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "ancillary_products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillaryProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "brand", length = 100)
    private String brand;

    @Column(name = "variant", length = 100)
    private String variant;

    /** Package size (e.g. 1.0 litre, 500g). Always positive. */
    @Column(name = "package_size", nullable = false, precision = 10, scale = 3)
    private BigDecimal packageSize;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "unit_of_measure", nullable = false)
    private UnitOfMeasure unitOfMeasure;

    /** Running count of whole units in stock. Decremented on each sale; incremented on each delivery. */
    @Column(name = "current_stock_units", nullable = false)
    private Integer currentStockUnits;

    /** Nullable — null means no low-stock alert is configured for this product. */
    @Column(name = "low_stock_threshold")
    private Integer lowStockThreshold;

    /**
     * GST rate applied to this product at point of sale.
     * Stored per-product because different ancillary products may have different GST slabs.
     * Default 18% (standard GST slab for automotive products in India).
     * 0% = GST exempt. Must be >= 0.
     */
    @Column(name = "gst_rate_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal gstRatePercent;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private AncillaryProductStatus status;

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
