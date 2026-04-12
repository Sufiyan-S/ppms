package com.ppms.pump;

/**
 * Request body for PATCH /api/pumps/{pumpId}/dus/{duId}/nozzles/{nozzleId}/tank
 *
 * tankId — the underground tank to map this nozzle to.
 *          Pass null to clear the mapping (nozzle becomes unmapped; shift-open will be blocked).
 */
public record MapOutletToTankRequest(Long tankId) {}
