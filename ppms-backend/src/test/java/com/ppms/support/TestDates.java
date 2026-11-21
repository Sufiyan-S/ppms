package com.ppms.support;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/** "Today" and "now" in the business zone, so test data matches the server's BusinessClock whatever the JVM zone. */
public final class TestDates {

    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Kolkata");

    private TestDates() {
    }

    public static LocalDate today() {
        return LocalDate.now(BUSINESS_ZONE);
    }

    public static OffsetDateTime now() {
        return OffsetDateTime.now(BUSINESS_ZONE);
    }
}
