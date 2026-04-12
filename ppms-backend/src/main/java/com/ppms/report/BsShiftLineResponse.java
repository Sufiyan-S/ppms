package com.ppms.report;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class BsShiftLineResponse {
    private Long     shiftId;
    private String   operatorName;
    private Integer  duNumber;
    private String   duName;
    private String   fuelTypesSummary;
    private BigDecimal litresSold;
    private BigDecimal expectedRevenue;
    private BigDecimal cashCollected;
    private BigDecimal upiCollected;
    private BigDecimal cardCollected;
    private BigDecimal fleetCardCollected;
    private BigDecimal creditAmount;
    private BigDecimal discrepancy;

    /** Per-nozzle fuel reading breakdown for this shift. */
    private List<NozzleReadingLine> nozzleReadings;

    @Data
    @Builder
    public static class NozzleReadingLine {
        /** Position on the DU (1–9). */
        private Integer    nozzleNumber;
        /** FuelType enum name, e.g. "PETROL". */
        private String     fuelType;
        private BigDecimal litresSold;
        private BigDecimal expectedRevenue;
    }
}
