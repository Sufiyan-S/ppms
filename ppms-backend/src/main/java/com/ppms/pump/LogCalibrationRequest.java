package com.ppms.pump;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Request body for POST /api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations.
 */
public record LogCalibrationRequest(

        @NotNull @PastOrPresent LocalDate calibrationDate,

        /** Required: shifts on the nozzle are blocked once this date has passed. Must be after calibrationDate. */
        @NotNull(message = "Next calibration due date is required") LocalDate nextCalibrationDue,

        @NotBlank @Size(max = 150) String calibratedBy,

        @NotBlank(message = "Certificate reference is required") @Size(max = 100) String certificateReference,

        @Size(max = 1000) String notes
) {}
