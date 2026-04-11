package com.ppms.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;

@Repository
public interface TokenBlacklistRepository extends JpaRepository<TokenBlacklist, Long> {

    /** Fast lookup by hash — backed by idx_blacklist_hash index. */
    boolean existsByTokenHash(String tokenHash);

    /**
     * Removes entries whose JWT has already expired — they would be rejected by
     * the JWT validator anyway, so keeping them provides no security value.
     * Intended for a periodic cleanup job (not yet scheduled — can be added later).
     */
    @Modifying
    @Query("DELETE FROM TokenBlacklist t WHERE t.expiresAt < :now")
    void deleteExpiredEntries(OffsetDateTime now);
}
