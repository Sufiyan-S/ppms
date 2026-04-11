package com.ppms.planning;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

public record AddLeaveRequest(
        @NotNull LocalDate leaveDate,
        String reason
) {}
