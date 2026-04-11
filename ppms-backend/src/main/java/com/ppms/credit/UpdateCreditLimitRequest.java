package com.ppms.credit;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdateCreditLimitRequest {

    @NotNull(message = "Credit limit is required")
    @DecimalMin(value = "0", message = "Credit limit cannot be negative")
    private BigDecimal creditLimit;
}
