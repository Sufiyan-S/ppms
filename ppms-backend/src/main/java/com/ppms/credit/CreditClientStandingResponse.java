package com.ppms.credit;

import java.math.BigDecimal;

/**
 * What the credit client picker needs to grey out clients a sale would be refused for. Operators read this,
 * so it carries no balance or limit beyond the amount still available.
 *
 * @param availableCredit null when the client's group has no credit limit
 */
public record CreditClientStandingResponse(Long clientId, CreditStatus creditStatus, BigDecimal availableCredit) {
}
