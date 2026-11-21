package com.ppms.credit;

import java.math.BigDecimal;

public record CreditBalanceLookupResponse(BigDecimal outstandingAmount, BigDecimal creditLimit) {
}
