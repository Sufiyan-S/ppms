package com.ppms.shift;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Units dispensed between two readings of a nozzle meter that wraps to zero at its maximum value. */
public final class MeterRollover {

    private static final BigDecimal ROLLOVER_START_FRACTION = new BigDecimal("0.99");

    private MeterRollover() {
    }

    /** A meter only rolls over to zero from the top of its range; anything lower is a mistyped reading. */
    public static boolean canRollOverFrom(BigDecimal startReading, BigDecimal maxMeterValue) {
        return startReading.compareTo(maxMeterValue.multiply(ROLLOVER_START_FRACTION)) >= 0;
    }

    public static BigDecimal unitsBetween(BigDecimal start, BigDecimal end, BigDecimal maxMeterValue) {
        if (end.compareTo(start) >= 0) {
            return end.subtract(start).setScale(3, RoundingMode.HALF_UP);
        }
        return maxMeterValue.subtract(start).add(end).setScale(3, RoundingMode.HALF_UP);
    }
}
