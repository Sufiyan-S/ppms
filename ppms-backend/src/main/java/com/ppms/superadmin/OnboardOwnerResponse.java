package com.ppms.superadmin;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * Response for POST /api/super-admin/onboard-owner.
 * Returns the newly created owner and their first pump.
 */
@Data
@Builder
public class OnboardOwnerResponse {

    private Long ownerId;
    private String employeeId;
    private String fullName;
    private String phoneNumber;

    private Long pumpId;
    private String pumpName;

    private OffsetDateTime createdAt;
}
