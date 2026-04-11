package com.ppms.superadmin;

import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Platform-wide analytics for the SUPER_ADMIN dashboard.
 * Returns aggregated counts across all owners/pumps on the platform.
 *
 * GET /api/super-admin/analytics
 */
@RestController
@RequestMapping("/api/super-admin")
@RequiredArgsConstructor
public class PlatformAnalyticsController {

    private final UserRepository         userRepository;
    private final PumpLocationRepository pumpLocationRepository;

    @GetMapping("/analytics")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public Map<String, Object> getPlatformAnalytics() {
        long totalOwners    = userRepository.countByRole(UserRole.OWNER);
        long totalPumps     = pumpLocationRepository.count();
        long totalStaff     = userRepository.countByRole(UserRole.OPERATOR)
                            + userRepository.countByRole(UserRole.ADMIN)
                            + userRepository.countByRole(UserRole.MANAGER);

        return Map.of(
                "totalOwners", totalOwners,
                "totalPumps",  totalPumps,
                "totalStaff",  totalStaff
        );
    }
}
