package com.ppms.pump;

/**
 * Request body for PATCH /api/pumps/nozzles/{nozzleId}/outlets/{outletId}/tank
 *
 * tankId — the underground tank to map this outlet to.
 *          Pass null to clear the mapping (outlet becomes unmapped; shift-open will be blocked).
 */
public record MapOutletToTankRequest(Long tankId) {}
