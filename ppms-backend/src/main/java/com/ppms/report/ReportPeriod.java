package com.ppms.report;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * The time span a balance sheet covers: its business day, cut off at generation time for a sheet made
 * during that day. Items without a time of day are matched by their date, timestamped items by this span,
 * so sheets of consecutive days never overlap.
 */
public record ReportPeriod(LocalDate reportDate, OffsetDateTime start, OffsetDateTime end, boolean endsBeforeDayEnd) {

    public static ReportPeriod ofBusinessDay(LocalDate reportDate, OffsetDateTime dayStart, OffsetDateTime nextDayStart,
                                             OffsetDateTime cutOff) {
        boolean cutOffDuringDay = cutOff.isBefore(nextDayStart);
        return new ReportPeriod(reportDate, dayStart, cutOffDuringDay ? cutOff : nextDayStart, cutOffDuringDay);
    }
}
