package com.ppms.bank;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Value
@Builder
public class ImportSummaryResponse {
    Long id;
    Long pumpId;
    String bankName;
    String accountNumber;
    LocalDate statementFromDate;
    LocalDate statementToDate;
    int totalLines;
    int matchedLines;
    int unmatchedLines;
    Long importedByUserId;
    OffsetDateTime importedAt;
}
