package com.ppms.shift;

import com.ppms.fuel.FuelType;

import java.time.LocalDate;

/** Optional history filters; with none set the full history is returned, newest first. */
public record ShiftHistoryFilter(
        LocalDate from,
        LocalDate to,
        boolean discrepanciesOnly,
        DiscrepancyType discrepancyType,
        FuelType fuelType
) {}
