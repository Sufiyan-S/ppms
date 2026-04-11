package com.ppms.inventory;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "tanker_deliveries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TankerDelivery {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pump_id", nullable = false)
    private Long pumpId;

    @Column(name = "tank_id", nullable = false)
    private Long tankId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    @Column(name = "quantity_delivered", nullable = false)
    private BigDecimal quantityDelivered;

    @Column(name = "cost_price_per_unit", nullable = false)
    private BigDecimal costPricePerUnit;

    @Column(name = "delivery_date", nullable = false)
    private OffsetDateTime deliveryDate;

    @Column(name = "invoice_reference", nullable = false)
    private String invoiceReference;

    @Column(name = "logged_by_user_id", nullable = false)
    private Long loggedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
