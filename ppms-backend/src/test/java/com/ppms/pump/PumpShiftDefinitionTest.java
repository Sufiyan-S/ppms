package com.ppms.pump;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class PumpShiftDefinitionTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Test
    void nightShiftStoredAsEndingAt0859StillCoversTheLastMinuteBeforeNine() {
        PumpShiftDefinition night = definition("21:00", "08:59", true);

        assertThat(night.containsTime(LocalTime.parse("08:59:30"))).isTrue();
        assertThat(night.containsTime(LocalTime.parse("09:00"))).isFalse();
        assertThat(night.containsTime(LocalTime.parse("21:00"))).isTrue();
    }

    @Test
    void morningShiftStartsExactlyWhereTheNightShiftEnds() {
        PumpShiftDefinition morning = definition("09:00", "20:59", false);

        assertThat(morning.containsTime(LocalTime.parse("09:00"))).isTrue();
        assertThat(morning.containsTime(LocalTime.parse("20:59:59"))).isTrue();
        assertThat(morning.containsTime(LocalTime.parse("21:00"))).isFalse();
        assertThat(morning.containsTime(LocalTime.parse("08:59:59"))).isFalse();
    }

    @Test
    void shiftEndingAtMidnightCoversTheLastMinuteOfTheDay() {
        PumpShiftDefinition evening = definition("15:00", "23:59", false);

        assertThat(evening.containsTime(LocalTime.parse("23:59:30"))).isTrue();
        assertThat(evening.containsTime(LocalTime.parse("14:59"))).isFalse();
    }

    @Test
    void onlyTheEarlyMorningPartOfANightShiftIsAfterMidnight() {
        PumpShiftDefinition night = definition("21:00", "08:59", true);

        assertThat(night.isInAfterMidnightPart(LocalTime.parse("00:30"))).isTrue();
        assertThat(night.isInAfterMidnightPart(LocalTime.parse("22:00"))).isFalse();
        assertThat(definition("09:00", "20:59", false).isInAfterMidnightPart(LocalTime.parse("10:00"))).isFalse();
    }

    @Test
    void scheduledEndIsTheDisplayedEndOnTheRightDay() {
        LocalDate shiftDate = LocalDate.of(2026, 3, 5);

        assertThat(definition("21:00", "08:59", true).scheduledEnd(shiftDate, IST))
                .isEqualTo(OffsetDateTime.of(2026, 3, 6, 9, 0, 0, 0, IST.getRules().getOffset(shiftDate.atStartOfDay())));
        assertThat(definition("15:00", "23:59", false).scheduledEnd(shiftDate, IST))
                .isEqualTo(OffsetDateTime.of(2026, 3, 6, 0, 0, 0, 0, IST.getRules().getOffset(shiftDate.atStartOfDay())));
    }

    private PumpShiftDefinition definition(String start, String end, boolean crossesMidnight) {
        return PumpShiftDefinition.builder()
                .startTime(LocalTime.parse(start))
                .endTime(LocalTime.parse(end))
                .crossesMidnight(crossesMidnight)
                .build();
    }
}
