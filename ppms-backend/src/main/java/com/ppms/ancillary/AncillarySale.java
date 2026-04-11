package com.ppms.ancillary;

import com.ppms.transaction.TransactionPaymentMode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Counter sale of an ancillary product.
 * Not tied to any shift — standalone transaction.
 * selling_price_per_unit is snapshotted from the current ancillary_product_prices row at sale time.
 */
@Entity
@Table(name = "ancillary_sales")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AncillarySale {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    /** Whole units sold — no fractional units. */
    @Column(name = "quantity_units", nullable = false)
    private Integer quantityUnits;

    /** Snapshotted from ancillary_product_prices at time of sale — historically accurate. */
    @Column(name = "selling_price_per_unit", nullable = false, precision = 12, scale = 2)
    private BigDecimal sellingPricePerUnit;

    /** quantity_units × selling_price_per_unit, rounded HALF_UP to 2dp. */
    @Column(name = "total_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalAmount;

    /**
     * GST component of the sale: total_amount × (gst_rate_percent / 100), rounded HALF_UP.
     * 0.00 for GST-exempt products.
     */
    @Column(name = "gst_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal gstAmount;

    /**
     * Total payable by the customer including GST: total_amount + gst_amount.
     * This is the figure shown on receipts and used for cash reconciliation.
     */
    @Column(name = "total_with_gst", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalWithGst;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_mode", nullable = false)
    @Builder.Default
    private TransactionPaymentMode paymentMode = TransactionPaymentMode.CASH;

    /** FK to credit_clients. Nullable — only populated for credit sales to known clients. */
    @Column(name = "client_id")
    private Long clientId;

    /** Free-form display name — used when client is not in the system or for walk-in credit. */
    @Column(name = "client_name", length = 150)
    private String clientName;

    @Column(name = "bill_no", length = 50)
    private String billNo;

    @Column(name = "notes")
    private String notes;

    @Column(name = "sold_by_user_id", nullable = false)
    private Long soldByUserId;

    @Column(name = "sale_date", nullable = false)
    private LocalDate saleDate;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
