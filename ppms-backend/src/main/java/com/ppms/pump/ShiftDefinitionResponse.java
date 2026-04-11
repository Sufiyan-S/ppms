package com.ppms.pump;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
public class ShiftDefinitionResponse {
    private Long id;
    private Long pumpId;
    private String name;
    private LocalTime startTime;
    private LocalTime endTime;
    private boolean crossesMidnight;
    @JsonProperty("isNightShift")
    private boolean isNightShift;
    private Integer sortOrder;
    private LocalDate effectiveFrom;
    private LocalDate effectiveTo;      // null = currently active

    /** Human-readable window, e.g. "10:00 PM – 10:00 AM" */
    private String windowLabel;

    public static ShiftDefinitionResponse from(PumpShiftDefinition d) {
        return ShiftDefinitionResponse.builder()
                .id(d.getId())
                .pumpId(d.getPumpId())
                .name(d.getName())
                .startTime(d.getStartTime())
                .endTime(d.getEndTime())
                .crossesMidnight(d.isCrossesMidnight())
                .isNightShift(d.isNightShift())
                .sortOrder(d.getSortOrder())
                .effectiveFrom(d.getEffectiveFrom())
                .effectiveTo(d.getEffectiveTo())
                .windowLabel(formatWindow(d))
                .build();
    }

    private static String formatWindow(PumpShiftDefinition d) {
        // End times are stored as exclusive upper bounds (e.g. stored "08:59", display "09:00").
        // Adding 1 minute restores the user-facing boundary time.
        return formatTime(d.getStartTime()) + " – " + formatTime(d.getEndTime().plusMinutes(1))
                + (d.isCrossesMidnight() ? " (+1)" : "");
    }

    private static String formatTime(java.time.LocalTime t) {
        int h = t.getHour();
        int m = t.getMinute();
        String ampm = h < 12 ? "AM" : "PM";
        int h12 = h % 12 == 0 ? 12 : h % 12;
        return String.format("%d:%02d %s", h12, m, ampm);
    }
}
