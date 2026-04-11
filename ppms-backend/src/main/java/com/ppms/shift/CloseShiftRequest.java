package com.ppms.shift;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class CloseShiftRequest {

    /**
     * End meter reading for each outlet on the nozzle.
     * Backend validates that every outlet that was opened has an end reading provided.
     */
    @NotEmpty(message = "At least one fuel reading is required")
    @Valid
    private List<OutletEndReadingRequest> fuelReadings;

    // Payment breakdown — all must be >= 0
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

    // Credit total — derived from creditEntries; still sent for quick backend validation
    @NotNull(message = "Credit total is required")
    @DecimalMin(value = "0", message = "Credit total must be >= 0")
    private BigDecimal creditTotal;

    @Valid
    private List<CreditEntryRequest> creditEntries = new ArrayList<>();

    private String discrepancyReason;

    // ── Inner records ────────────────────────────────────────────────────────

    public record OutletEndReadingRequest(
            @NotNull(message = "Outlet ID is required") Long outletId,
            @NotNull(message = "End reading is required") BigDecimal endReading
    ) {}

    public record CreditEntryRequest(
            @NotBlank(message = "Client name is required") String clientName,
            /** Optional client ID — preferred over name-based lookup when a sub-account is selected. */
            Long clientId,
            String billNo,
            @NotNull(message = "Amount is required")
            @DecimalMin(value = "0.01", message = "Credit entry amount must be greater than zero")
            BigDecimal amount,
            String fuelType,
            String description,
            /** Optional vehicle registration number, e.g. "MH12AB1234" */
            String vehicleRegistration,
            /** Optional driver name for fleet/company accounts */
            String driverName
    ) {}
}
