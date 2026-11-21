package com.ppms.pump;

import java.time.LocalDate;

/** The shift definition in force right now, and the business date the shift belongs to. */
public record CurrentShiftWindow(PumpShiftDefinition definition, LocalDate shiftDate) {
}
