package com.ppms.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
public class RecordDipCheckRequest {

    @NotNull(message = "Tank is required")
    private Long tankId;

    @NotNull(message = "Measured quantity is required")
    @DecimalMin(value = "0", message = "Measured quantity cannot be negative")
    private BigDecimal measuredQuantity;

    // Optional; when sent it must be today, because a dip check always resets today's stock.
    private LocalDate checkedAt;

    // The operator who physically took the dipstick reading
    private Long checkedByUserId;

    // Optional note from the operator or manager
    private String notes;

    // Current meter reading of every nozzle drawing from this tank on a shift that is still open.
    @Valid
    private List<NozzleMeterReading> nozzleReadings = new ArrayList<>();

    public record NozzleMeterReading(
            @NotNull(message = "Nozzle ID is required") Long nozzleId,
            @NotNull(message = "Meter reading is required")
            @DecimalMin(value = "0", message = "Meter reading cannot be negative")
            BigDecimal meterReading
    ) {}
}
