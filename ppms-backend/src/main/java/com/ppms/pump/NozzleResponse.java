package com.ppms.pump;

import com.ppms.fuel.FuelType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class NozzleResponse {

    private Long id;
    private Long pumpId;
    private Integer nozzleNumber;
    private String status;
    private BigDecimal maxMeterValue;

    /**
     * The fuel outlets configured on this nozzle.
     * Each outlet has its own meter counter (lastReading).
     * 1–4 outlets for non-CNG nozzles; exactly 1 CNG outlet for CNG nozzles.
     */
    private List<OutletResponse> outlets;

    // ── Inner record ────────────────────────────────────────────────────────

    public record OutletResponse(
            Long outletId,
            FuelType fuelType,
            BigDecimal lastReading,
            Long tankId   // null until mapped; freeze-captured at shift-open
    ) {}
}
