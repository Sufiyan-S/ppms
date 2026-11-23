package com.ppms.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;

@Repository
public interface LoginAttemptRepository extends JpaRepository<LoginAttempt, Long> {

    /**
     * Counts failed login attempts for a phone number within the given time window.
     * Used by LoginRateLimiterService to decide whether to block a new attempt.
     * Query is backed by idx_login_phone_time index.
     */
    @Query("""
            SELECT COUNT(a) FROM LoginAttempt a
            WHERE a.phoneNumber = :phoneNumber
              AND a.success = false
              AND a.attemptedAt > :since
            """)
    long countRecentFailures(String phoneNumber, OffsetDateTime since);

    @Query("""
            SELECT COUNT(a) FROM LoginAttempt a
            WHERE a.ipAddress = :ipAddress
              AND a.success = false
              AND a.attemptedAt > :since
            """)
    long countRecentFailuresByIp(String ipAddress, OffsetDateTime since);

    @Modifying
    @Query("DELETE FROM LoginAttempt a WHERE a.phoneNumber = :phoneNumber AND a.success = false")
    int deleteFailuresByPhoneNumber(String phoneNumber);
}
