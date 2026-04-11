package com.ppms.report;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class GenerateBalanceSheetRequest {

    @NotNull(message = "Report type is required")
    private BalanceSheetReportType reportType;

    @NotNull(message = "Report date is required")
    private LocalDate reportDate;

    /**
     * Required when reportType = SHIFT.
     * ID of the PumpShiftDefinition to generate the report for.
     * The definition must be active for the given reportDate and belong to the target pump.
     */
    private Long shiftDefinitionId;

    /** Optional free-text note attached to the generated report */
    private String notes;

    /**
     * When true, bypasses the duplicate guard and creates a new revision.
     * The period label will be suffixed with #2, #3, etc.
     */
    private boolean forceRegenerate;
}
