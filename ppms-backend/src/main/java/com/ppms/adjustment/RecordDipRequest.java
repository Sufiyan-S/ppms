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

    /** The tank the fuel was drained from; its fuel type is the entry's fuel type. */
    @NotNull(message = "tankId is required")
    private Long tankId;

    @NotNull(message = "litresRemoved is required")
    @DecimalMin(value = "0.001", message = "litresRemoved must be greater than 0")
    private BigDecimal litresRemoved;

    @NotBlank(message = "reason is required")
    private String reason;

    /** Defaults to today; any other date is refused because the drain reduces today's stock. */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate dipDate;
}
