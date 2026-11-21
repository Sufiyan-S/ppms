package com.ppms.user;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class UpdatePayRatesRequest {
    /** For OPERATOR: night shift hourly rate. */
    private BigDecimal shift1HourlyRate;
    /** For OPERATOR: standard day hourly rate. */
    private BigDecimal standardHourlyRate;
    /** For MANAGER / ADMIN / ACCOUNTANT: flat daily rate. */
    private BigDecimal dailyRate;
}
