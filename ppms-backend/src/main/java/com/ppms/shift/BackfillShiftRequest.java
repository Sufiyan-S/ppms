package com.ppms.shift;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Request body for the Admin/Owner backfill shift endpoint.
 *
 * Allows entering historical shift data for a pump that was onboarded after
 * operations had already occurred. The resulting shift is stored with
 * status CLOSED_BALANCED or CLOSED_DISCREPANCY_PENDING and isBackfilled=true.
 *
 * Constraints:
 * - shiftDate must be within the last 365 days and not today or in the future
 * - nozzle.closingReading >= nozzle.openingReading
 * - shiftDefinitionId must have been effective on shiftDate for this pump
 * - Inventory lots must exist for each fuel type sold (Option C — record deliveries first)
 */
@Data
public class BackfillShiftRequest {

    /** The shift window definition that was active on the given date. */
    @NotNull(message = "Shift definition ID is required")
    private Long shiftDefinitionId;

    /**
     * The business date of the historical shift.
     * Must be within the last 365 days. Cannot be today or a future date.
     */
    @NotNull(message = "Shift date is required")
    @PastOrPresent(message = "Shift date cannot be in the future")
    private LocalDate shiftDate;

    /** The Dispensary Unit (MPD machine) the shift was run on. */
    @NotNull(message = "Dispensary Unit ID is required")
    private Long duId;

    /** The operator who was on duty for this historical shift. */
    @NotNull(message = "Operator ID is required")
    private Long operatorId;

    /**
     * Per-nozzle opening and closing meter readings.
     * At least one nozzle reading is required.
     */
    @NotEmpty(message = "At least one nozzle reading is required")
    @Valid
    private List<NozzleReadingRequest> nozzleReadings;

    // ── Payment breakdown ──────────────────────────────────────────────────────

    @NotNull(message = "Cash collected is required")
    @DecimalMin(value = "0", message = "Cash collected must be >= 0")
    private BigDecimal cashCollected;

    @NotNull(message = "UPI collected is required")
    @DecimalMin(value = "0", message = "UPI collected must be >= 0")
    private BigDecimal upiCollected;

    @NotNull(message = "Card collected is required")
    @DecimalMin(value = "0", message = "Card collected must be >= 0")
    private BigDecimal cardCollected;

    @NotNull(message = "Fleet card collected is required")
    @DecimalMin(value = "0", message = "Fleet card collected must be >= 0")
    private BigDecimal fleetCardCollected;

    /**
     * Total credit sales for this shift.
     * Must match the sum of creditEntries if entries are provided.
     */
    @NotNull(message = "Credit total is required")
    @DecimalMin(value = "0", message = "Credit total must be >= 0")
    private BigDecimal creditTotal;

    /** Optional credit sale entries to record against the ledger. */
    @Valid
    private List<CloseShiftRequest.CreditEntryRequest> creditEntries = new ArrayList<>();

    /** Required when actual collected != amount due (i.e. when a discrepancy exists). */
    private String discrepancyReason;

    /**
     * Optional historical fuel rates to persist before processing this backfill.
     * Required for any fuel type whose price is not recorded in the database on or before shiftDate.
     * Keys are FuelType enum names (e.g. "PETROL", "DIESEL").
     * Values are price per litre in ₹ — must be > 0.
     * Rates are saved atomically within the backfill transaction with effectiveFrom = shiftDate 00:00 IST,
     * and only when no price already exists for that fuel type on or before shiftDate.
     */
    private Map<String, BigDecimal> fuelRateOverrides;

    // ── Inner record ───────────────────────────────────────────────────────────

    /**
     * Opening and closing meter readings for a single nozzle.
     * closingReading must be >= openingReading (rollover is not supported for backfill).
     */
    public record NozzleReadingRequest(
            @NotNull(message = "Nozzle ID is required") Long nozzleId,
            @NotNull(message = "Opening reading is required")
            @DecimalMin(value = "0", message = "Opening reading must be >= 0") BigDecimal openingReading,
            @NotNull(message = "Closing reading is required")
            @DecimalMin(value = "0", message = "Closing reading must be >= 0") BigDecimal closingReading
    ) {}
}
