package com.ppms.pump;

import com.ppms.fuel.FuelType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * API response for a Dispensary Unit with its nozzles.
 * Returned by GET /api/pumps/{pumpId}/dus and related endpoints.
 */
@Data
@Builder
public class DUResponse {

    private Long id;
    private Long pumpId;
    private Integer duNumber;
    private String name;
    private String status;

    /** All nozzles on this DU, ordered by nozzle_number. */
    private List<NozzleDetail> nozzles;

    // ── Inner record ──────────────────────────────────────────────────────────

    public record NozzleDetail(
            Long id,
            Integer nozzleNumber,
            FuelType fuelType,
            BigDecimal lastReading,
            BigDecimal maxMeterValue,
            Long tankId,        // null until mapped in Setup
            String status
    ) {}
}
