package com.ppms.invoice;

import java.util.Map;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;

import java.time.LocalDate;
import java.time.Month;

/** GST invoice serials: unique and consecutive per financial year (April–March), at most 16 characters. */
public final class InvoiceNumbering {

    public static final int MAX_INVOICE_NUMBER_LENGTH = 16;

    private InvoiceNumbering() {
    }

    /** "2026-27" for any date from 1 April 2026 to 31 March 2027. */
    public static String financialYearOf(LocalDate date) {
        int startYear = date.getMonth().compareTo(Month.APRIL) >= 0 ? date.getYear() : date.getYear() - 1;
        return startYear + "-" + String.format("%02d", (startYear + 1) % 100);
    }

    /** PREFIX/26-27/0001 for financial year 2026-27. */
    public static String invoiceNumber(String prefix, String financialYear, int sequenceNumber) {
        String number = prefix + "/" + financialYear.substring(2) + "/" + String.format("%04d", sequenceNumber);
        if (number.length() > MAX_INVOICE_NUMBER_LENGTH) {
            throw new BusinessException(ErrorCodes.INVOICE_NUMBER_TOO_LONG,
                    Map.of("invoiceNumber", number, "max", MAX_INVOICE_NUMBER_LENGTH),
                    "Invoice number " + number + " would be longer than "
                    + MAX_INVOICE_NUMBER_LENGTH + " characters. Use a shorter invoice prefix in pump setup.");
        }
        return number;
    }
}
