package com.ppms.pump;

import lombok.Data;

import java.math.BigDecimal;

/**
 * Used by PUT /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/reading
 * to manually correct the stored meter reading for a nozzle.
 * Needed when a meter is physically replaced or reset.
 */
@Data
public class UpdateNozzleReadingRequest {

    private BigDecimal reading;
}
