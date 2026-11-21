package com.ppms.support;

import com.ppms.common.time.BusinessClock;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/** A business clock stopped at one instant in IST, for unit tests of time-dependent rules. */
public class FixedBusinessClock implements BusinessClock {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final OffsetDateTime now;

    public FixedBusinessClock(OffsetDateTime now) {
        this.now = now;
    }

    @Override
    public ZoneId zone() {
        return IST;
    }

    @Override
    public OffsetDateTime now() {
        return now.atZoneSameInstant(IST).toOffsetDateTime();
    }

    @Override
    public LocalDate today() {
        return now().toLocalDate();
    }

    @Override
    public OffsetDateTime startOfDay(LocalDate date) {
        return date.atStartOfDay(IST).toOffsetDateTime();
    }
}
