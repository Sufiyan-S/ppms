package com.ppms.planning;

import java.time.LocalDate;

/**
 * Represents one operator's actual attendance for a (date, shiftDefinitionId) slot.
 * Derived from real Shift records, not planning entries.
 */
public record ActualSlotDto(LocalDate shiftDate, Long shiftDefinitionId, Long operatorUserId) {}
