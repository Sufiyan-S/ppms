package com.ppms.inventory;

import java.math.BigDecimal;

/** A nozzle drawing from a tank on a shift that is still open; a dip check on the tank needs its current meter reading. */
public record OpenShiftNozzleResponse(
        Long shiftId,
        Long nozzleId,
        Integer nozzleNumber,
        String duName,
        String fuelType,
        BigDecimal openingReading,
        BigDecimal maxMeterValue
) {}
