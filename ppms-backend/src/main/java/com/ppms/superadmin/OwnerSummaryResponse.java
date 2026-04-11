package com.ppms.superadmin;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Response for GET /api/super-admin/owners.
 * Returns all pump owner accounts with their associated pumps.
 */
@Data
@Builder
public class OwnerSummaryResponse {

    private Long ownerId;
    private String employeeId;
    private String fullName;
    private String phoneNumber;
    private String status;
    private OffsetDateTime createdAt;
    private List<PumpSummary> pumps;

    @Data
    @Builder
    public static class PumpSummary {
        private Long pumpId;
        private String pumpName;
        private String pumpAddress;
        private boolean enabled;
        private long staffCount;
    }
}
