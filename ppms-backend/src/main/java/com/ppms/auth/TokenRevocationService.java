package com.ppms.auth;

import java.util.Date;

/**
 * Abstraction for JWT revocation (logout / forced sign-out).
 * The default implementation is DB-backed (TokenBlacklist table).
 * This interface allows swapping to a Redis-backed implementation in the future
 * without touching the callers — important for high-traffic deployments where
 * a per-request DB lookup on every authenticated request would be a bottleneck.
 */
public interface TokenRevocationService {

    /**
     * Marks a JWT as revoked. Subsequent requests with this token will be rejected.
     *
     * @param jwt      The raw JWT string.
     * @param userId   The ID of the user who owned this token.
     * @param expiresAt The JWT's original expiry date (from the exp claim).
     */
    void revoke(String jwt, Long userId, Date expiresAt);

    /**
     * Returns true if the given JWT has been explicitly revoked (e.g., via logout).
     * This check is performed on every authenticated request in JwtAuthenticationFilter.
     *
     * @param jwt The raw JWT string.
     */
    boolean isRevoked(String jwt);
}
