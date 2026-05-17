package com.ppms.superadmin;

import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds the default Super Admin account on first startup if none exists.
 *
 * Credentials are read from environment variables:
 *   SUPER_ADMIN_PHONE    — defaults to 8888888888  (dev only)
 *   SUPER_ADMIN_PASSWORD — NO default; must be set explicitly in production.
 *
 * If SUPER_ADMIN_PASSWORD is not set, startup is aborted with a clear error
 * so the app never runs in production without a real password configured.
 *
 * This runs after Flyway migrations complete, so the users table is guaranteed
 * to exist. If a SUPER_ADMIN already exists the seeder does nothing.
 */
@Component
@RequiredArgsConstructor
public class SuperAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminSeeder.class);

    private final UserRepository    userRepository;
    private final PasswordEncoder   passwordEncoder;

    @Value("${SUPER_ADMIN_PHONE:8888888888}")
    private String adminPhone;

    /**
     * No default — must be supplied via environment variable in production.
     * Falls back to "password" ONLY when the spring profile is "dev" or "local".
     * See the conditional logic below.
     */
    @Value("${SUPER_ADMIN_PASSWORD:#{null}}")
    private String adminPassword;

    @Value("${spring.profiles.active:default}")
    private String activeProfile;

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.countByRole(UserRole.SUPER_ADMIN) > 0) {
            log.info("SuperAdminSeeder: SUPER_ADMIN already exists — skipping.");
            return;
        }

        // In production (non-dev profiles) the password MUST be supplied explicitly.
        boolean isDevProfile = activeProfile.contains("dev") || activeProfile.contains("local");

        if (adminPassword == null) {
            if (isDevProfile) {
                log.warn("SuperAdminSeeder: SUPER_ADMIN_PASSWORD not set — using default 'password' for dev. " +
                         "Never run this way in production.");
                adminPassword = "password";
            } else {
                throw new IllegalStateException(
                    "SUPER_ADMIN_PASSWORD environment variable is required in production. " +
                    "Set it before starting the application.");
            }
        }

        User superAdmin = User.builder()
                .employeeId("SA-001")
                .fullName("Super Admin")
                .phoneNumber(adminPhone)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .role(UserRole.SUPER_ADMIN)
                .status(UserStatus.ACTIVE)
                .build();

        userRepository.save(superAdmin);
        log.info("SuperAdminSeeder: Default SUPER_ADMIN created with phone {}.", adminPhone);
    }
}
