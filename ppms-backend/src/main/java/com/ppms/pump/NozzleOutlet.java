package com.ppms.pump;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "nozzle_outlets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NozzleOutlet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    /**
     * The underground tank this outlet draws fuel from.
     * Nullable — a null value means the outlet has not yet been mapped to a tank.
     * Shift-open is blocked when this is null (enforced in ShiftService).
     */
    @Column(name = "tank_id")
    private Long tankId;

    /**
     * Latest meter counter reading for this outlet.
     * Updated every time a shift closes. Used to pre-fill the start reading
     * when opening the next shift, reducing manual entry errors.
     */
    @Column(name = "last_reading", nullable = false)
    private BigDecimal lastReading;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
        if (lastReading == null) {
            lastReading = BigDecimal.ZERO;
        }
    }
}
