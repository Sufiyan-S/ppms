package com.ppms.planning;

public record SetPreferenceRequest(
        /** Null means ANY shift is fine (no preference). */
        Long preferredShiftDefinitionId,
        /** Null means no fixed day-off preference. */
        PreferredDayOff preferredDayOff
) {}
