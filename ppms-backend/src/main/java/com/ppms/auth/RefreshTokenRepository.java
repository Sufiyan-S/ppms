package com.ppms.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    /** SELECT FOR UPDATE so two concurrent refreshes with the same token cannot both pass the usedAt == null check. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM RefreshToken t WHERE t.tokenHash = :tokenHash")
    Optional<RefreshToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("UPDATE RefreshToken t SET t.revokedAt = :revokedAt WHERE t.familyId = :familyId AND t.revokedAt IS NULL")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("revokedAt") OffsetDateTime revokedAt);

    /** Deletes up to {@code batchSize} tokens that expired or were revoked before {@code cutoff}. */
    @Modifying
    @Query(value = """
            DELETE FROM refresh_tokens
            WHERE id IN (
                SELECT id FROM refresh_tokens
                WHERE expires_at < :cutoff OR revoked_at < :cutoff
                LIMIT :batchSize
            )
            """, nativeQuery = true)
    int deleteExpiredOrRevokedBefore(@Param("cutoff") OffsetDateTime cutoff, @Param("batchSize") int batchSize);
}
