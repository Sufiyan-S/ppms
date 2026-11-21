package com.ppms.report;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * The time span a DAY balance sheet covers. A live report (generated on its own report date) covers
 * the rolling 24 hours before generation, so items without a time of day are matched by when they were
 * recorded; a historical report covers its business day, so those items are matched by their date.
 */
public record ReportPeriod(LocalDate reportDate, OffsetDateTime start, OffsetDateTime end, boolean live) {
}
