package com.ppms.bank;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parsing helpers for bank statement CSV rows (RFC 4180 quoting on a single line).
 */
final class BankStatementCsv {

    private static final Pattern DASH_PLACEHOLDER = Pattern.compile("[-\u2013\u2014]{1,2}");
    private static final Pattern DEBIT_CREDIT_SUFFIX = Pattern.compile("(?i)\\s*(cr|dr)\\.?$");
    private static final Pattern NOISE = Pattern.compile("[₹$,\\s\\p{Z}]|(?i)rs\\.?|(?i)inr");

    private BankStatementCsv() {
    }

    /**
     * Splits one CSV line into fields, honouring double-quoted fields that contain commas
     * and escaped quotes (""). Returns empty when a quoted field is never closed.
     */
    static Optional<List<String>> splitLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    inQuotes = false;
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                fields.add(field.toString());
                field.setLength(0);
            } else {
                field.append(c);
            }
        }
        if (inQuotes) {
            return Optional.empty();
        }
        fields.add(field.toString());
        return Optional.of(fields);
    }

    /**
     * Parses an amount such as "₹1,234.56", "Rs. 1,234.56", "-500", "(500.00)" or "12,345.00 Cr".
     * A blank cell or a "-" / "--" placeholder is zero. A leading minus, surrounding brackets or a
     * "Dr" suffix make the amount negative. Returns empty when the cell is not a number, so the
     * caller can skip the row.
     */
    static Optional<BigDecimal> parseMoney(String raw) {
        if (raw == null) {
            return Optional.of(BigDecimal.ZERO);
        }
        String value = raw.replace("\uFEFF", "").strip();
        if (value.isEmpty() || DASH_PLACEHOLDER.matcher(value).matches()) {
            return Optional.of(BigDecimal.ZERO);
        }
        boolean negative = false;
        Matcher suffix = DEBIT_CREDIT_SUFFIX.matcher(value);
        if (suffix.find()) {
            negative = suffix.group(1).equalsIgnoreCase("dr");
            value = value.substring(0, suffix.start()).strip();
        }
        if (value.startsWith("(") && value.endsWith(")")) {
            negative = !negative;
            value = value.substring(1, value.length() - 1).strip();
        }
        value = NOISE.matcher(value).replaceAll("");
        if (value.startsWith("-")) {
            negative = !negative;
            value = value.substring(1);
        }
        if (!value.matches("\\d+(\\.\\d+)?|\\.\\d+")) {
            return Optional.empty();
        }
        BigDecimal amount = new BigDecimal(value);
        return Optional.of(negative ? amount.negate() : amount);
    }

    /**
     * Balance is optional: a blank cell, a dash placeholder or an unreadable value gives null
     * instead of rejecting the whole row.
     */
    static BigDecimal parseOptionalBalance(String raw) {
        if (raw == null || raw.isBlank() || DASH_PLACEHOLDER.matcher(raw.strip()).matches()) {
            return null;
        }
        return parseMoney(raw).orElse(null);
    }
}
