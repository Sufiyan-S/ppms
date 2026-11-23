package com.ppms.user;

import java.math.BigDecimal;
import java.util.Set;

public record StaffResponse(
        Long id,
        String employeeId,
        String fullName,
        String phoneNumber,
        String gender,
        Boolean nightShiftConsent,
        String role,
        Long assignedPumpId,
        String status,
        BigDecimal dailyRate,
        BigDecimal shift1HourlyRate,
        BigDecimal standardHourlyRate,
        String preferredLanguage
) {
    private static final Set<UserRole> ROLES_SEEING_CONTACT_AND_PAY =
            Set.of(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN);

    static StaffResponse visibleTo(User viewer, User u) {
        StaffResponse full = from(u);
        if (ROLES_SEEING_CONTACT_AND_PAY.contains(viewer.getRole())) {
            return full;
        }
        return new StaffResponse(full.id(), full.employeeId(), full.fullName(), null, full.gender(),
                full.nightShiftConsent(), full.role(), full.assignedPumpId(), full.status(), null, null, null, full.preferredLanguage());
    }

    static StaffResponse from(User u) {
        return new StaffResponse(
                u.getId(),
                u.getEmployeeId(),
                u.getFullName(),
                u.getPhoneNumber(),
                u.getGender() != null ? u.getGender().name() : null,
                u.isNightShiftConsent(),
                u.getRole().name(),
                u.getAssignedPumpId(),
                u.getStatus().name(),
                u.getDailyRate(),
                u.getShift1HourlyRate(),
                u.getStandardHourlyRate(),
                u.getPreferredLanguage()
        );
    }
}
