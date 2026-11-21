package com.ppms.export;

final class CsvCells {

    private static final String FORMULA_TRIGGERS = "=+-@\t\r";

    private CsvCells() {
    }

    static String number(Number value) {
        return value == null ? "" : value.toString();
    }

    /**
     * Free text is quoted per RFC 4180, and text a spreadsheet would run as a formula is
     * prefixed with an apostrophe so it opens as plain text.
     */
    static String text(Object value) {
        if (value == null) {
            return "";
        }
        String text = value.toString();
        if (!text.isEmpty() && FORMULA_TRIGGERS.indexOf(text.charAt(0)) >= 0) {
            text = "'" + text;
        }
        if (text.contains(",") || text.contains("\n") || text.contains("\r") || text.contains("\"")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}
