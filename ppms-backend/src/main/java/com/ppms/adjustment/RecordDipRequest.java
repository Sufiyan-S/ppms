package com.ppms.adjustment;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class RecordDipRequest {

    @NotBlank(message = "fuelType is required")
    private String fuelType;

    @NotNull(message = "litresRemoved is required")
    @DecimalMin(value = "0.001", message = "litresRemoved must be greater than 0")
    private BigDecimal litresRemoved;

    @NotBlank(message = "reason is required")
    private String reason;

    /** Defaults to today if not provided. */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate dipDate;
}
