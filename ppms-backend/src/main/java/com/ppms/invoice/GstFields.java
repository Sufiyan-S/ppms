package com.ppms.invoice;

import java.util.Map;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalises and validates the GST identifiers typed into pump, client and product forms.
 * Each method returns null for a blank value, so sending "" clears the field.
 */
public final class GstFields {

    private static final Pattern GSTIN = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$");
    private static final Pattern HSN_CODE = Pattern.compile("^[0-9]{4,8}$");
    private static final Pattern INVOICE_PREFIX = Pattern.compile("^[A-Z0-9]{1,5}$");

    private GstFields() {
    }

    public static String normaliseGstin(String value) {
        String gstin = upperCaseOrNull(value);
        if (gstin != null && !GSTIN.matcher(gstin).matches()) {
            throw new BusinessException(ErrorCodes.GSTIN_INVALID,
                    Map.of(),
                    "GSTIN must be 15 characters in the format 27ABCDE1234F1Z5.");
        }
        return gstin;
    }

    public static String normaliseHsnCode(String value) {
        String hsnCode = upperCaseOrNull(value);
        if (hsnCode != null && !HSN_CODE.matcher(hsnCode).matches()) {
            throw new BusinessException(ErrorCodes.HSN_CODE_INVALID, Map.of(), "HSN code must be 4 to 8 digits.");
        }
        return hsnCode;
    }

    public static String normaliseInvoicePrefix(String value) {
        String prefix = upperCaseOrNull(value);
        if (prefix != null && !INVOICE_PREFIX.matcher(prefix).matches()) {
            throw new BusinessException(ErrorCodes.INVOICE_PREFIX_INVALID,
                    Map.of(),
                    "Invoice prefix must be 1 to 5 letters or digits.");
        }
        return prefix;
    }

    public static String trimmedOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /** The first two digits of a GSTIN are the GST state code of the registration. */
    public static String stateCodeOf(String gstin) {
        return gstin.substring(0, 2);
    }

    private static String upperCaseOrNull(String value) {
        String trimmed = trimmedOrNull(value);
        return trimmed == null ? null : trimmed.toUpperCase(Locale.ROOT);
    }
}
