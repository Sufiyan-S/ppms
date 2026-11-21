package com.ppms.scheduler;

import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.scheduler.OverdueShiftProcessor.Outcome;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.FixedBusinessClock;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverdueShiftProcessorTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final LocalDate SHIFT_DATE = LocalDate.of(2026, 11, 10);
    private static final Long SHIFT_ID = 5L;
    private static final Long DEFINITION_ID = 9L;

    private final ShiftRepository shiftRepository = mock(ShiftRepository.class);
    private final PumpShiftDefinitionRepository definitionRepository = mock(PumpShiftDefinitionRepository.class);
    private final OverdueShiftProcessor processor = new OverdueShiftProcessor(
            shiftRepository, definitionRepository, new FixedBusinessClock(istTime(SHIFT_DATE, "12:00")));

    @Test
    void shiftIsMarkedOverdueExactlyAtItsScheduledEnd() {
        Shift shift = givenShift(ShiftStatus.OPEN);
        givenDefinition("09:00", "16:59", false);

        Outcome outcome = processor.process(SHIFT_ID, istTime(SHIFT_DATE, "17:00"));

        assertThat(outcome).isEqualTo(Outcome.MARKED_OVERDUE);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.OPEN_OVERDUE);
        assertThat(shift.getIsOverdueFlag()).isTrue();
    }

    @Test
    void shiftIsLeftOpenOneNanosecondBeforeItsScheduledEnd() {
        Shift shift = givenShift(ShiftStatus.OPEN);
        givenDefinition("09:00", "16:59", false);

        Outcome outcome = processor.process(SHIFT_ID, istTime(SHIFT_DATE, "17:00").minusNanos(1));

        assertThat(outcome).isEqualTo(Outcome.UNCHANGED);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    @Test
    void nightShiftEndsOnTheDayAfterItsShiftDate() {
        Shift shift = givenShift(ShiftStatus.OPEN);
        givenDefinition("21:00", "08:59", true);

        assertThat(processor.process(SHIFT_ID, istTime(SHIFT_DATE, "23:30"))).isEqualTo(Outcome.UNCHANGED);
        assertThat(processor.process(SHIFT_ID, istTime(SHIFT_DATE.plusDays(1), "08:59"))).isEqualTo(Outcome.UNCHANGED);
        assertThat(processor.process(SHIFT_ID, istTime(SHIFT_DATE.plusDays(1), "09:00"))).isEqualTo(Outcome.MARKED_OVERDUE);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.OPEN_OVERDUE);
    }

    @Test
    void shiftAlreadyClosedByHandIsNotTouchedEvenLongAfterItsEnd() {
        Shift shift = givenShift(ShiftStatus.CLOSED_BALANCED);
        givenDefinition("09:00", "16:59", false);

        Outcome outcome = processor.process(SHIFT_ID, istTime(SHIFT_DATE.plusDays(3), "17:00"));

        assertThat(outcome).isEqualTo(Outcome.UNCHANGED);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.CLOSED_BALANCED);
    }

    @Test
    void overdueShiftIsAutoClosedOnTheNextRunAtThatRunsTime() {
        Shift shift = givenShift(ShiftStatus.OPEN_OVERDUE);
        OffsetDateTime runTime = istTime(SHIFT_DATE, "17:05");

        Outcome outcome = processor.process(SHIFT_ID, runTime);

        assertThat(outcome).isEqualTo(Outcome.AUTO_CLOSED);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.AUTO_CLOSED_OVERDUE);
        assertThat(shift.getActualEndTime()).isEqualTo(runTime);
    }

    private Shift givenShift(ShiftStatus status) {
        Shift shift = Shift.builder()
                .id(SHIFT_ID)
                .shiftDefinitionId(DEFINITION_ID)
                .shiftDate(SHIFT_DATE)
                .status(status)
                .build();
        when(shiftRepository.findByIdForUpdate(SHIFT_ID)).thenReturn(Optional.of(shift));
        return shift;
    }

    private void givenDefinition(String start, String storedEnd, boolean crossesMidnight) {
        when(definitionRepository.findById(DEFINITION_ID)).thenReturn(Optional.of(PumpShiftDefinition.builder()
                .id(DEFINITION_ID)
                .startTime(LocalTime.parse(start))
                .endTime(LocalTime.parse(storedEnd))
                .crossesMidnight(crossesMidnight)
                .build()));
    }

    private static OffsetDateTime istTime(LocalDate date, String time) {
        return LocalDateTime.of(date, LocalTime.parse(time)).atZone(IST).toOffsetDateTime();
    }
}
