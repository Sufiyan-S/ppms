package com.ppms.adjustment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class RecordAdjustmentRequest {

    /**
     * RESET  — sets the outlet's last reading to 0 (meter physically reset).
     * CUSTOM_READING — sets it to the provided newReading (meter replaced or corrected).
     */
    @NotBlank(message = "adjustmentType is required: RESET or CUSTOM_READING")
    private String adjustmentType;

    /**
     * Required for CUSTOM_READING. Ignored for RESET (backend forces 0).
     */
    private BigDecimal newReading;

    @NotBlank(message = "reason is required")
    private String reason;
}
