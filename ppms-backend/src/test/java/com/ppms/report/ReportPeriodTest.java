package com.ppms.report;

import com.ppms.common.time.BusinessClock;
import com.ppms.support.FixedBusinessClock;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ReportPeriodTest {

    private static final LocalDate YESTERDAY = LocalDate.of(2026, 11, 22);
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 23);

    private final BusinessClock clock = new FixedBusinessClock(OffsetDateTime.parse("2026-11-23T15:05:00+05:30"));

    @Test
    void sheetsOfConsecutiveDaysMeetAtMidnightWithoutOverlapping() {
        ReportPeriod yesterday = periodOf(YESTERDAY, clock.now());
        ReportPeriod today = periodOf(TODAY, clock.now());

        assertThat(yesterday.end()).isEqualTo(today.start());
        assertThat(today.start()).isEqualTo(OffsetDateTime.parse("2026-11-23T00:00:00+05:30"));
    }

    @Test
    void todaysSheetEndsAtGenerationTime() {
        ReportPeriod today = periodOf(TODAY, clock.now());

        assertThat(today.end()).isEqualTo(clock.now());
        assertThat(today.endsBeforeDayEnd()).isTrue();
    }

    @Test
    void sheetOfAPastDayCoversTheWholeDay() {
        ReportPeriod yesterday = periodOf(YESTERDAY, clock.now());

        assertThat(yesterday.start()).isEqualTo(OffsetDateTime.parse("2026-11-22T00:00:00+05:30"));
        assertThat(yesterday.end()).isEqualTo(OffsetDateTime.parse("2026-11-23T00:00:00+05:30"));
        assertThat(yesterday.endsBeforeDayEnd()).isFalse();
    }

    private ReportPeriod periodOf(LocalDate day, OffsetDateTime cutOff) {
        return ReportPeriod.ofBusinessDay(day, clock.startOfDay(day), clock.startOfDay(day.plusDays(1)), cutOff);
    }
}
