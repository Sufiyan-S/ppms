package com.ppms.transaction;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Optional per-transaction fuel sale log.
 *
 * Operators can log individual customer transactions during a shift — for large credit sales,
 * fleet vehicle records, or UPI reconciliation (UTR number tracking).
 *
 * This is OPTIONAL and does NOT affect shift totals. Shift totals always come from
 * nozzle meter readings (start → end). This table is purely for detailed drill-down reporting.
 *
 * Future: when Razorpay/UPI integration is added, transactions will be auto-created
 * from payment gateway webhooks.
 */
@Entity
@Table(name = "fuel_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FuelTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // No FK — avoiding cascade complexity; validated at service layer
    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "nozzle_outlet_id", nullable = false)
    private Long nozzleOutletId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    @Column(name = "quantity_litres", nullable = false, precision = 10, scale = 3)
    private BigDecimal quantityLitres;

    @Column(name = "price_per_unit", nullable = false, precision = 10, scale = 4)
    private BigDecimal pricePerUnit;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "payment_mode", nullable = false)
    @Builder.Default
    private TransactionPaymentMode paymentMode = TransactionPaymentMode.CASH;

    // Optional vehicle registration for fleet tracking
    @Column(name = "vehicle_registration", length = 20)
    private String vehicleRegistration;

    // UTR number for UPI payments — enables reconciliation against bank statement
    @Column(name = "upi_reference", length = 50)
    private String upiReference;

    @Column(name = "notes")
    private String notes;

    @Column(name = "recorded_by_user_id", nullable = false)
    private Long recordedByUserId;

    @Column(name = "recorded_at", nullable = false, updatable = false)
    private OffsetDateTime recordedAt;

    @PrePersist
    protected void onCreate() {
        recordedAt = OffsetDateTime.now();
    }
}
