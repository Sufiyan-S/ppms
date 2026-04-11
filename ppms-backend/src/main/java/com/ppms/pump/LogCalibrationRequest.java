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

        /** Optional. Set this to schedule the next calibration check. */
        LocalDate nextCalibrationDue,

        @NotBlank @Size(max = 150) String calibratedBy,

        @Size(max = 100) String certificateReference,

        @Size(max = 1000) String notes
) {}
