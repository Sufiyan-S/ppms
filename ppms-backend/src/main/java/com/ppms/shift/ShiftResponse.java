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

    // ── DU info ──────────────────────────────────────────────────────────────
    private Long duId;
    private Integer duNumber;
    private String duName;

    /** Nozzles from this DU that are active in this shift. */
    private List<NozzleSummary> nozzles;

    private Long operatorId;
    private String operatorName;
    private String openedByUserName;

    private String shiftWindow;
    private LocalDate shiftDate;
    private OffsetDateTime actualStartTime;
    private OffsetDateTime actualEndTime;

    /** Per-nozzle fuel readings (one per nozzle in this shift). */
    private List<FuelReadingResponse> fuelReadings;

    private BigDecimal totalAmountDue;

    // Payment breakdown
    private BigDecimal cashCollected;
    private BigDecimal upiCollected;
    private BigDecimal cardCollected;
    private BigDecimal fleetCardCollected;
    private BigDecimal creditTotal;

    // Discrepancy
    private BigDecimal discrepancyAmount;
    private String discrepancyType;
    private String discrepancyReason;
    private String discrepancyResolution;
    private String discrepancyResolutionNote;

    private String status;

    private List<CreditEntryResponse> creditEntries;

    // ── Inner records ─────────────────────────────────────────────────────────

    public record NozzleSummary(
            Long id,
            Integer nozzleNumber,
            String fuelType
    ) {}

    public record FuelReadingResponse(
            Long nozzleId,
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
