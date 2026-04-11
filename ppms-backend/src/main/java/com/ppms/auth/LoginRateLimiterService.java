package com.ppms.auth;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * Brute-force protection for the login endpoint.
 *
 * Policy: if a phone number has 5 or more failed login attempts in the last
 * 15 minutes, further attempts are blocked and a 429 (Too Many Requests) error
 * is returned to the caller.
 *
 * This is a simple sliding-window counter backed by the login_attempts table.
 * It is intentionally simple — no exponential backoff, no CAPTCHA, no account lock.
 * The 15-minute window means a brute-force attacker can attempt at most 20
 * passwords per hour, which is far too slow to succeed against a bcrypt hash.
 *
 * Future improvement: make the threshold and window configurable via application.yml.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LoginRateLimiterService {

    static final int MAX_FAILURES = 5;
    static final int WINDOW_MINUTES = 15;

    private final LoginAttemptRepository attemptRepository;

    /**
     * Returns true if this phone number should be blocked from logging in.
     * Called BEFORE the password is verified — this avoids burning bcrypt CPU
     * on requests that are already going to be rejected.
     */
    public boolean isBlocked(String phoneNumber) {
        OffsetDateTime windowStart = OffsetDateTime.now().minusMinutes(WINDOW_MINUTES);
        long recentFailures = attemptRepository.countRecentFailures(phoneNumber, windowStart);
        if (recentFailures >= MAX_FAILURES) {
            log.warn("Login blocked due to rate limit: phone={} failures={} in last {}m",
                    phoneNumber, recentFailures, WINDOW_MINUTES);
            return true;
        }
        return false;
    }

    /**
     * Records the outcome of a login attempt.
     * Called AFTER the authentication decision is made so we always have an accurate record.
     *
     * @param phoneNumber The phone number used in the attempt.
     * @param ipAddress   The request IP address (may be null if not available).
     * @param success     True if authentication succeeded.
     */
    @Transactional
    public void recordAttempt(String phoneNumber, String ipAddress, boolean success) {
        attemptRepository.save(LoginAttempt.builder()
                .phoneNumber(phoneNumber)
                .ipAddress(ipAddress)
                .success(success)
                .build());
    }
}
