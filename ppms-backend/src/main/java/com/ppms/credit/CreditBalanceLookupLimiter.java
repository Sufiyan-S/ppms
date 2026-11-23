package com.ppms.credit;

import java.util.Map;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.TooManyRequestsException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Limits the unauthenticated credit-balance lookup so phone numbers and PINs cannot be guessed.
 */
@Slf4j
@Service
public class CreditBalanceLookupLimiter {

    static final int MAX_LOOKUPS_PER_IP = 20;
    static final int MAX_LOOKUPS_PER_PHONE = 5;
    static final int WINDOW_MINUTES = 15;

    private final Cache<String, AtomicInteger> lookupCounts = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(WINDOW_MINUTES))
            .maximumSize(100_000)
            .build();

    private final Cache<String, AtomicInteger> phoneLookupCounts = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(WINDOW_MINUTES))
            .maximumSize(100_000)
            .build();

    /** Limits by IP and by pump + phone, so rotating IPs cannot guess one client's PIN. */
    public void checkLookupAllowed(String ipAddress, Long pumpId, String phone) {
        int ipCount = lookupCounts.get(ipAddress, key -> new AtomicInteger()).incrementAndGet();
        int phoneCount = phoneLookupCounts.get(pumpId + ":" + phone, key -> new AtomicInteger()).incrementAndGet();
        if (ipCount > MAX_LOOKUPS_PER_IP || phoneCount > MAX_LOOKUPS_PER_PHONE) {
            log.warn("Credit balance lookup blocked: ip={} pump={} ipLookups={} phoneLookups={} in last {}m",
                    ipAddress, pumpId, ipCount, phoneCount, WINDOW_MINUTES);
            throw new TooManyRequestsException(ErrorCodes.TOO_MANY_BALANCE_LOOKUPS, Map.of("minutes", WINDOW_MINUTES),
                    "Too many balance lookups. Please wait " + WINDOW_MINUTES + " minutes before trying again.");
        }
    }
}
