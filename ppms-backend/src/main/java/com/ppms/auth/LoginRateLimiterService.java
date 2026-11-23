package com.ppms.auth;

import com.ppms.common.time.BusinessClock;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.ppms.common.exception.TooManyRequestsException;
import com.ppms.common.exception.ErrorCodes;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Brute-force protection for the login and forgot-password endpoints.
 *
 * Login: sliding 15-minute window over the login_attempts table, per phone number
 * (stops guessing one account) and per IP (stops spraying one password across many accounts).
 *
 * Forgot-password: fixed 15-minute in-memory window per IP and per phone number
 * (stops flooding a user's inbox with reset emails).
 */
@Slf4j
@Service
public class LoginRateLimiterService {

    static final int MAX_FAILURES_PER_PHONE = 5;
    static final int MAX_FAILURES_PER_IP = 20;
    static final int MAX_RESET_REQUESTS_PER_PHONE = 3;
    static final int MAX_RESET_REQUESTS_PER_IP = 10;
    static final int WINDOW_MINUTES = 15;

    private final LoginAttemptRepository attemptRepository;
    private final BusinessClock businessClock;
    private final Cache<String, AtomicInteger> resetRequestCounts = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(WINDOW_MINUTES))
            .maximumSize(100_000)
            .build();

    public LoginRateLimiterService(LoginAttemptRepository attemptRepository, BusinessClock businessClock) {
        this.attemptRepository = attemptRepository;
        this.businessClock = businessClock;
    }

    /**
     * Called before the password is verified so blocked callers do not burn bcrypt CPU.
     */
    public void checkLoginAllowed(String phoneNumber, String ipAddress) {
        OffsetDateTime windowStart = businessClock.now().minusMinutes(WINDOW_MINUTES);

        long phoneFailures = attemptRepository.countRecentFailures(phoneNumber, windowStart);
        if (phoneFailures >= MAX_FAILURES_PER_PHONE) {
            log.warn("Login blocked by phone limit: phone={} failures={} in last {}m",
                    PhoneNumberMasking.mask(phoneNumber), phoneFailures, WINDOW_MINUTES);
            throw tooManyRequests();
        }

        if (ipAddress != null) {
            long ipFailures = attemptRepository.countRecentFailuresByIp(ipAddress, windowStart);
            if (ipFailures >= MAX_FAILURES_PER_IP) {
                log.warn("Login blocked by IP limit: ip={} failures={} in last {}m",
                        ipAddress, ipFailures, WINDOW_MINUTES);
                throw tooManyRequests();
            }
        }
    }

    /**
     * Throws 429 when the IP is over its limit. Returns false (no email, same generic response)
     * when only the phone is over its limit, so strangers cannot lock a user out of resets.
     */
    public boolean isResetEmailAllowed(String phoneNumber, String ipAddress) {
        if (ipAddress != null && incrementAndCheck("ip:" + ipAddress, MAX_RESET_REQUESTS_PER_IP)) {
            log.warn("Password reset request blocked by IP limit: ip={}", ipAddress);
            throw new TooManyRequestsException(ErrorCodes.TOO_MANY_PASSWORD_RESET_REQUESTS,
                    Map.of("minutes", WINDOW_MINUTES),
                    "Too many password reset requests. Please wait " + WINDOW_MINUTES + " minutes before trying again.");
        }
        if (incrementAndCheck("phone:" + phoneNumber, MAX_RESET_REQUESTS_PER_PHONE)) {
            log.warn("Password reset email suppressed by phone limit: phone={}", PhoneNumberMasking.mask(phoneNumber));
            return false;
        }
        return true;
    }

    @Transactional
    public void recordAttempt(String phoneNumber, String ipAddress, boolean success) {
        attemptRepository.save(LoginAttempt.builder()
                .phoneNumber(phoneNumber)
                .ipAddress(ipAddress)
                .success(success)
                .build());
    }

    /** Lets a user whose password was just reset by an admin sign in at once, even after a lockout. */
    @Transactional
    public void clearFailedLogins(String phoneNumber) {
        int cleared = attemptRepository.deleteFailuresByPhoneNumber(phoneNumber);
        log.info("Cleared {} failed login attempts for phone={}", cleared, PhoneNumberMasking.mask(phoneNumber));
    }

    private boolean incrementAndCheck(String key, int limit) {
        return resetRequestCounts.get(key, k -> new AtomicInteger()).incrementAndGet() > limit;
    }

    private TooManyRequestsException tooManyRequests() {
        return new TooManyRequestsException(ErrorCodes.TOO_MANY_LOGIN_ATTEMPTS, Map.of("minutes", WINDOW_MINUTES),
                "Too many failed login attempts. Please wait " + WINDOW_MINUTES + " minutes before trying again.");
    }
}
