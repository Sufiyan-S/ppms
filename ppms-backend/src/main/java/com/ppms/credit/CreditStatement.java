package com.ppms.credit;

import java.math.BigDecimal;
import java.util.List;

/**
 * What the printable statement shows. For a parent account the rows and the outstanding cover its whole group,
 * each row carrying the name of the account it belongs to; otherwise they cover the client alone.
 *
 * @param subAccountNames empty unless the client is a parent account
 */
public record CreditStatement(List<CreditTransactionResponse> transactions, BigDecimal outstanding,
                              List<String> subAccountNames) {

    public boolean coversSubAccounts() {
        return !subAccountNames.isEmpty();
    }
}
