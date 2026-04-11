package com.ppms.common.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

/**
 * Configures Caffeine in-memory caches.
 *
 * tokenBlacklist cache:
 *   - Stores revoked JWT hashes to avoid hitting the DB on every authenticated request.
 *   - Only "revoked=true" results are cached (via @Cacheable unless="#result == false").
 *   - TTL matches the JWT expiry (24 h default) — after expiry the JWT is invalid anyway,
 *     so there is no need to keep the cache entry beyond that.
 *   - Max 10,000 entries protects heap from unbounded growth if many tokens are revoked.
 *
 * Why Caffeine and not Redis?
 *   At current scale a single-JVM Caffeine cache is zero-latency and zero-infrastructure.
 *   If the app scales to multiple pods, each pod has its own cache; a revoked token may
 *   still be accepted by another pod for up to the cache TTL period. For a petrol pump
 *   management system this risk is acceptable. Swap the bean for a Redis-backed
 *   CacheManager if stricter cross-pod revocation is required.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    public static final String TOKEN_BLACKLIST_CACHE = "tokenBlacklist";

    @Value("${ppms.jwt.expiration-ms:86400000}")
    private long jwtExpirationMs;

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager(TOKEN_BLACKLIST_CACHE);
        manager.setCaffeine(Caffeine.newBuilder()
                .recordStats()
                .expireAfterWrite(jwtExpirationMs, TimeUnit.MILLISECONDS)
                .maximumSize(10_000));
        return manager;
    }
}
