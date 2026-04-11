package com.ppms.auth;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;

/**
 * Records every login attempt (success and failure) for rate-limiting and audit.
 * Never stores passwords or tokens — only the phone number, IP, and outcome.
 */
@Entity
@Table(name = "login_attempts")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "phone_number", nullable = false)
    private String phoneNumber;

    /** IPv4 or IPv6 address of the request origin. Null if not available. */
    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "success", nullable = false)
    private boolean success;

    @Column(name = "attempted_at", nullable = false, updatable = false)
    private OffsetDateTime attemptedAt;

    @PrePersist
    protected void onCreate() {
        attemptedAt = OffsetDateTime.now();
    }
}
