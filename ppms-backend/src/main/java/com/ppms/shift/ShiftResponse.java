package com.ppms.shift;

import com.ppms.fuel.FuelType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
public class ShiftResponse {

    private Long id;
    private Long pumpId;
    private Long nozzleId;
    private Integer nozzleNumber;
    private Long operatorId;
    private String operatorName;
    private String openedByUserName;

    private String shiftWindow;
    private LocalDate shiftDate;
    private OffsetDateTime actualStartTime;
    private OffsetDateTime actualEndTime;

    /** Per-outlet fuel readings (one per fuel type on the nozzle). */
    private List<FuelReadingResponse> fuelReadings;

    /** Computed at close: sum of all (units * price) across all fuel types. */
    private BigDecimal totalAmountDue;

    // Payment breakdown
    private BigDecimal cashCollected;
    private BigDecimal upiCollected;
    private BigDecimal cardCollected;
    private BigDecimal fleetCardCollected;
    private BigDecimal creditTotal;

    // Discrepancy info
    private BigDecimal discrepancyAmount;
    private String discrepancyType;
    private String discrepancyReason;
    private String discrepancyResolution;
    private String discrepancyResolutionNote;

    private String status;

    private List<CreditEntryResponse> creditEntries;

    // ── Inner records ────────────────────────────────────────────────────────

    public record FuelReadingResponse(
            Long outletId,
            FuelType fuelType,
            BigDecimal startReading,
            BigDecimal endReading,
            BigDecimal priceSnapshot,
            BigDecimal unitsSold
    ) {}

    public record CreditEntryResponse(
            Long id,
            String clientName,
            String billNo,
            BigDecimal amount,
            String fuelType,
            String description,
            String voidStatus,
            String voidReason,
            String vehicleRegistration,
            String driverName
    ) {}
}
