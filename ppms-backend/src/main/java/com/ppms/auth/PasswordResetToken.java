package com.ppms.auth;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One-time password reset token.
 *
 * Flow:
 *  1. User submits phone number → system looks up their email → emails a UUID token link.
 *  2. User clicks link → frontend sends token + new password to /api/auth/reset-password.
 *  3. System validates token (not expired, not used), updates password, marks used_at.
 *
 * Tokens expire after 1 hour (validated in service code).
 * Once used (used_at is set), subsequent use of the same token is rejected.
 */
@Entity
@Table(name = "password_reset_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // No FK — token must remain accessible even if the user is later deactivated
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token", nullable = false, unique = true)
    private UUID token;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    /** Null = unused; set on the first (and only) successful use. */
    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (token == null) {
            token = UUID.randomUUID();
        }
        createdAt = OffsetDateTime.now();
    }
}
