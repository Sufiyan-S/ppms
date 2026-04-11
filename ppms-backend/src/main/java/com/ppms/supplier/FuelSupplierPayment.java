package com.ppms.supplier;

import com.ppms.credit.PaymentMode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Records a payment made by the pump operator to a fuel supplier.
 * Payments may be linked to a specific tanker delivery (delivery_id) or may be
 * advance/partial payments not tied to any single delivery (delivery_id = null).
 *
 * This enables the owner to track total amounts paid vs. total deliveries received,
 * giving visibility into outstanding supplier dues.
 */
@Entity
@Table(name = "fuel_supplier_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FuelSupplierPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "supplier_id", nullable = false)
    private Long supplierId;

    /** Nullable — advance or partial payments not tied to a specific delivery. */
    @Column(name = "delivery_id")
    private Long deliveryId;

    @Column(name = "amount", nullable = false)
    private BigDecimal amount;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_mode", nullable = false)
    private PaymentMode paymentMode;

    @Column(name = "reference_no", length = 100)
    private String referenceNo;

    @Column(name = "notes")
    private String notes;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
