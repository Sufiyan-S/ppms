package com.ppms.auth;

import com.ppms.user.User;
import com.ppms.user.UserRole;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.security.SignatureException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-that-is-comfortably-over-32-bytes";

    private JwtService jwtService;
    private User user;

    @BeforeEach
    void createService() {
        jwtService = serviceWith(SECRET, 60_000);
        user = User.builder().id(7L).phoneNumber("9876543210").role(UserRole.MANAGER).tokenVersion(2).build();
    }

    @Test
    void tokenIssuedForTheUserAtTheirCurrentVersionIsValid() {
        String token = tokenFor(user, 7L, 2);

        assertThat(jwtService.isTokenValid(token, user)).isTrue();
        assertThat(jwtService.extractUsername(token)).isEqualTo("9876543210");
    }

    @Test
    void tokenFromBeforeAPasswordChangeIsRejected() {
        String token = tokenFor(user, 7L, 1);

        assertThat(jwtService.isTokenValid(token, user)).isFalse();
    }

    @Test
    void tokenCarryingAnotherUsersIdIsRejectedEvenWithTheSamePhone() {
        String token = tokenFor(user, 8L, 2);

        assertThat(jwtService.isTokenValid(token, user)).isFalse();
    }

    @Test
    void tokenWithoutAVersionClaimIsRejected() {
        String token = jwtService.generateToken(user, Map.of(JwtService.USER_ID_CLAIM, 7L));

        assertThat(jwtService.isTokenValid(token, user)).isFalse();
    }

    @Test
    void expiredTokenCannotBeRead() {
        JwtService shortLived = serviceWith(SECRET, -1_000);
        String token = shortLived.generateToken(user, Map.of(JwtService.USER_ID_CLAIM, 7L, JwtService.TOKEN_VERSION_CLAIM, 2));

        assertThatThrownBy(() -> shortLived.isTokenValid(token, user)).isInstanceOf(ExpiredJwtException.class);
    }

    @Test
    void tokenSignedWithAnotherSecretIsRejected() {
        String forged = serviceWith("a-completely-different-secret-of-enough-length!!", 60_000)
                .generateToken(user, Map.of(JwtService.USER_ID_CLAIM, 7L, JwtService.TOKEN_VERSION_CLAIM, 2));

        assertThatThrownBy(() -> jwtService.isTokenValid(forged, user)).isInstanceOf(SignatureException.class);
    }

    @Test
    void missingOrShortSecretStopsStartup() {
        assertThatThrownBy(() -> serviceWith("", 1).validateJwtSecret()).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> serviceWith("too-short", 1).validateJwtSecret()).isInstanceOf(IllegalStateException.class);
    }

    private String tokenFor(User subject, long userIdClaim, int version) {
        return jwtService.generateToken(subject,
                Map.of(JwtService.USER_ID_CLAIM, userIdClaim, JwtService.TOKEN_VERSION_CLAIM, version));
    }

    private static JwtService serviceWith(String secret, long expirationMs) {
        JwtService service = new JwtService();
        ReflectionTestUtils.setField(service, "jwtSecret", secret);
        ReflectionTestUtils.setField(service, "jwtExpirationMs", expirationMs);
        return service;
    }
}
