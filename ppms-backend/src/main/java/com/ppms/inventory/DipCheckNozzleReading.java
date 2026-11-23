package com.ppms.inventory;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** A nozzle's meter reading taken with a dip check while its shift was still open, kept for audit. */
@Entity
@Table(name = "dip_check_nozzle_readings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DipCheckNozzleReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dip_check_id", nullable = false)
    private Long dipCheckId;

    @Column(name = "shift_id", nullable = false)
    private Long shiftId;

    @Column(name = "nozzle_id", nullable = false)
    private Long nozzleId;

    @Column(name = "opening_reading", nullable = false)
    private BigDecimal openingReading;

    @Column(name = "meter_reading", nullable = false)
    private BigDecimal meterReading;

    @Column(name = "units_sold", nullable = false)
    private BigDecimal unitsSold;
}
