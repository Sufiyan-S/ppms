package com.ppms.inventory;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class CreateTankerRequest {

    @NotBlank(message = "Tanker name is required")
    @Size(max = 100)
    private String name;

    @NotNull(message = "Capacity is required")
    @DecimalMin(value = "100", message = "Capacity must be at least 100 litres")
    private BigDecimal capacityLitres;

    @NotNull(message = "Tanker type is required")
    private TankerType tankerType;

    private boolean defaultTanker;
}
