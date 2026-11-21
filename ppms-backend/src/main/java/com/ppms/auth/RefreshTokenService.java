package com.ppms.auth;

import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;

/**
 * Issues, rotates and revokes refresh tokens. A login starts a family; each refresh marks the presented
 * token used and issues the next one in the family, never past the family's absolute expiry.
 * A used token presented again is treated as stolen: the family is revoked and every session of the user ends.
 */
@Slf4j
@Service
public class RefreshTokenService {

    static final String SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final BusinessClock businessClock;
    private final Duration refreshTokenLifetime;
    private final Duration sessionMaxLifetime;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
                               UserRepository userRepository,
                               JwtService jwtService,
                               BusinessClock businessClock,
                               @Value("${ppms.jwt.refresh-token-days}") long refreshTokenDays,
                               @Value("${ppms.jwt.session-max-days}") long sessionMaxDays) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.businessClock = businessClock;
        this.refreshTokenLifetime = Duration.ofDays(refreshTokenDays);
        this.sessionMaxLifetime = Duration.ofDays(sessionMaxDays);
    }

    @Transactional
    public IssuedRefreshToken startSession(User user) {
        OffsetDateTime now = businessClock.now();
        return issue(user, UUID.randomUUID(), now.plus(sessionMaxLifetime), now);
    }

    // The reuse branch revokes the family and bumps the token version before refusing; that must commit.
    @Transactional(noRollbackFor = InvalidCredentialsException.class)
    public LoginResult refresh(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw sessionExpired();
        }
        RefreshToken token = refreshTokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(rawToken))
                .orElseThrow(this::sessionExpired);
        OffsetDateTime now = businessClock.now();

        if (token.getRevokedAt() != null) {
            throw sessionExpired();
        }
        if (token.getUsedAt() != null) {
            endAllSessionsAfterReuse(token, now);
            throw sessionExpired();
        }
        if (!now.isBefore(token.getExpiresAt()) || !now.isBefore(token.getFamilyExpiresAt())) {
            throw sessionExpired();
        }

        User user = userRepository.findById(token.getUserId()).orElseThrow(this::sessionExpired);
        if (!user.isEnabled() || !user.isAccountNonLocked() || token.getTokenVersion() != user.getTokenVersion()) {
            throw sessionExpired();
        }

        token.setUsedAt(now);
        refreshTokenRepository.save(token);
        IssuedRefreshToken nextToken = issue(user, token.getFamilyId(), token.getFamilyExpiresAt(), now);
        return new LoginResult(jwtService.generateAccessToken(user), nextToken, LoginResponse.from(user));
    }

    /** Revokes the family of the presented token, so neither it nor any later rotation can be used. */
    @Transactional
    public void endSession(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        refreshTokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(rawToken)).ifPresent(token -> {
            refreshTokenRepository.revokeFamily(token.getFamilyId(), businessClock.now());
            log.info("Refresh token family revoked on logout for userId={}, tokenId={}", token.getUserId(), token.getId());
        });
    }

    @Transactional
    public int deleteExpiredOrRevokedBatchOlderThan(int days, int batchSize) {
        return refreshTokenRepository.deleteExpiredOrRevokedBefore(businessClock.now().minusDays(days), batchSize);
    }

    private void endAllSessionsAfterReuse(RefreshToken token, OffsetDateTime now) {
        refreshTokenRepository.revokeFamily(token.getFamilyId(), now);
        userRepository.findByIdForUpdate(token.getUserId()).ifPresent(user -> {
            user.setTokenVersion(user.getTokenVersion() + 1);
            userRepository.save(user);
        });
        log.warn("Refresh token reuse detected for userId={}; all sessions of the user were ended", token.getUserId());
    }

    private IssuedRefreshToken issue(User user, UUID familyId, OffsetDateTime familyExpiresAt, OffsetDateTime now) {
        OffsetDateTime refreshExpiry = now.plus(refreshTokenLifetime);
        OffsetDateTime expiresAt = refreshExpiry.isBefore(familyExpiresAt) ? refreshExpiry : familyExpiresAt;
        String rawToken = newRawToken();
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHashing.sha256Hex(rawToken))
                .familyId(familyId)
                .tokenVersion(user.getTokenVersion())
                .expiresAt(expiresAt)
                .familyExpiresAt(familyExpiresAt)
                .build());
        return new IssuedRefreshToken(rawToken, Duration.between(now, expiresAt));
    }

    private static String newRawToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private InvalidCredentialsException sessionExpired() {
        return new InvalidCredentialsException(SESSION_EXPIRED_MESSAGE);
    }
}
