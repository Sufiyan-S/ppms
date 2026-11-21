package com.ppms.auth;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One link in a chain of rotating refresh tokens. Each successful refresh marks the token used and issues
 * the next one in the same family; presenting a used token again means it was copied, so the family is revoked.
 */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "family_id", nullable = false)
    private UUID familyId;

    /** The user's token version when this token was issued; a later password change makes it unusable. */
    @Column(name = "token_version", nullable = false)
    private int tokenVersion;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Absolute end of the login session, however often the token is rotated. */
    @Column(name = "family_expires_at", nullable = false)
    private OffsetDateTime familyExpiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    @Column(name = "revoked_at")
    private OffsetDateTime revokedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = OffsetDateTime.now();
    }
}
