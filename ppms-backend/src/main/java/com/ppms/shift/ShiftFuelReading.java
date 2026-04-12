package com.ppms.shift;

import com.ppms.fuel.FuelType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;

@Entity
@Table(name = "shift_fuel_readings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShiftFuelReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    /**
     * The nozzle this reading belongs to.
     * One nozzle = one fuel type = one meter counter.
     */
    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "fuel_type", nullable = false)
    private FuelType fuelType;

    /** Meter counter at shift open. */
    @Column(name = "start_reading", nullable = false)
    private BigDecimal startReading;

    /** Meter counter at shift close. Null while shift is open. */
    @Column(name = "end_reading")
    private BigDecimal endReading;

    /** Fuel price snapshotted at shift open. Frozen for the lifetime of the shift. */
    @Column(name = "price_snapshot", nullable = false)
    private BigDecimal priceSnapshot;

    /**
     * The underground tank this nozzle was drawing from at shift-open time.
     * Frozen at open so FIFO lot attribution stays accurate even if the tank
     * mapping is later changed.
     */
    @Column(name = "tank_id")
    private Long tankId;

    /** Computed at shift close: handles meter rollover (end < start). */
    @Column(name = "units_sold")
    private BigDecimal unitsSold;
}
