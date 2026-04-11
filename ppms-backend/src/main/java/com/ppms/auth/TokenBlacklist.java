package com.ppms.auth;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

/**
 * Represents a revoked JWT token.
 * Stores a SHA-256 hash of the token (not the raw token) to avoid keeping
 * sensitive credentials in the database.
 * expires_at mirrors the JWT's original expiry — rows older than their expiry
 * can be safely purged (they would be rejected by the JWT validator anyway).
 */
@Entity
@Table(name = "token_blacklist")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TokenBlacklist {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** SHA-256 hex of the raw JWT string. Never the raw token. */
    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Mirrors the JWT's original exp claim — used to determine when this row can be cleaned up. */
    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "blacklisted_at", nullable = false, updatable = false)
    private OffsetDateTime blacklistedAt;

    @PrePersist
    protected void onCreate() {
        blacklistedAt = OffsetDateTime.now();
    }
}
