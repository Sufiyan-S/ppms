package com.ppms.pump;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreatePumpRequest {

    @NotBlank(message = "Pump name is required")
    private String name;

    @NotBlank(message = "Address is required")
    private String address;

    @NotNull(message = "Max nozzle count is required")
    @Min(value = 1, message = "Must have at least 1 nozzle")
    private Integer maxNozzleCount;
}
