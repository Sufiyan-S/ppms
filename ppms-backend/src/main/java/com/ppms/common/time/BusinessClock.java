package com.ppms.common.time;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * Abstraction over business time.
 *
 * Keeping date/time access behind an interface makes services easier to test and
 * avoids scattering hard-coded timezone rules across the codebase.
 */
public interface BusinessClock {

    ZoneId zone();

    OffsetDateTime now();

    LocalDate today();

    OffsetDateTime startOfDay(LocalDate date);
}
