package com.ppms.inventory;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "lot_consumptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LotConsumption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lot_id", nullable = false)
    private Long lotId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "source_type", nullable = false)
    private LotConsumptionSource sourceType;

    // Populated when source_type = SHIFT_CLOSE
    @Column(name = "shift_id")
    private Long shiftId;

    // Populated when source_type = DIP_CORRECTION
    @Column(name = "dip_correction_id")
    private Long dipCorrectionId;

    @Column(name = "quantity_consumed", nullable = false)
    private BigDecimal quantityConsumed;

    @Column(name = "cost_price_per_unit", nullable = false)
    private BigDecimal costPricePerUnit;

    // Not persisted — computed in Java as quantityConsumed * costPricePerUnit when needed
    @Transient
    private BigDecimal totalCost;

    @Column(name = "consumed_at", nullable = false)
    private OffsetDateTime consumedAt;

    @PrePersist
    protected void onCreate() {
        consumedAt = OffsetDateTime.now();
    }
}
