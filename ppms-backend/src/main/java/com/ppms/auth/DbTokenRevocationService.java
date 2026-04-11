package com.ppms.auth;

import com.ppms.common.config.CacheConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.util.Date;

/**
 * DB-backed implementation of TokenRevocationService.
 * Stores a SHA-256 hash of each revoked JWT in the token_blacklist table.
 *
 * Performance: isRevoked() is annotated with @Cacheable — the DB is only queried on the
 * first check for a given JWT. Subsequent calls return the cached result from Caffeine.
 * Only "revoked=true" results are cached (unless="#result == false") to avoid caching
 * valid tokens and missing the revocation window.
 *
 * The revoke() method eagerly populates the cache directly via CacheManager so subsequent
 * isRevoked() calls for the same JWT are served from memory without a DB round-trip.
 *
 * See CacheConfig for TTL and size configuration.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DbTokenRevocationService implements TokenRevocationService {

    private final TokenBlacklistRepository blacklistRepository;
    private final CacheManager cacheManager;

    @Override
    @Transactional
    public void revoke(String jwt, Long userId, Date expiresAt) {
        String hash = sha256Hex(jwt);
        if (!blacklistRepository.existsByTokenHash(hash)) {
            TokenBlacklist entry = TokenBlacklist.builder()
                    .tokenHash(hash)
                    .userId(userId)
                    .expiresAt(expiresAt.toInstant().atOffset(ZoneOffset.UTC))
                    .build();
            blacklistRepository.save(entry);
            log.debug("Token revoked for userId={}", userId);
        }
        // Eagerly populate the cache so the next isRevoked() call is served from memory.
        // This avoids a DB round-trip immediately after logout.
        Cache cache = cacheManager.getCache(CacheConfig.TOKEN_BLACKLIST_CACHE);
        if (cache != null) {
            cache.put(jwt, Boolean.TRUE);
        }
    }

    /**
     * Returns true if the JWT has been revoked.
     *
     * Cached with Caffeine: only "true" (revoked) results are cached.
     * If the result is false (not revoked) the cache is skipped on the next call —
     * this ensures we always detect revocations without stale negatives.
     */
    @Override
    @Cacheable(value = CacheConfig.TOKEN_BLACKLIST_CACHE, key = "#jwt", unless = "#result == false")
    public boolean isRevoked(String jwt) {
        return blacklistRepository.existsByTokenHash(sha256Hex(jwt));
    }

    /**
     * Computes the SHA-256 hex digest of the input string.
     * SHA-256 is always available in the JVM — NoSuchAlgorithmException is
     * wrapped in IllegalStateException since it cannot occur in practice.
     */
    private String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available — this should never happen", e);
        }
    }

}
