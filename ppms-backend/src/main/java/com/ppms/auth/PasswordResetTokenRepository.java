package com.ppms.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    Optional<PasswordResetToken> findByToken(UUID token);

    /**
     * Fetches the token with a PESSIMISTIC WRITE (SELECT FOR UPDATE) lock.
     * Used in the reset-password flow to serialise concurrent requests using the same token,
     * preventing two simultaneous calls from both passing the usedAt == null check
     * and double-resetting the password.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM PasswordResetToken t WHERE t.token = :token")
    Optional<PasswordResetToken> findByTokenForUpdate(@Param("token") UUID token);
}
