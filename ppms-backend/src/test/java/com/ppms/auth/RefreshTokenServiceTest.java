package com.ppms.auth;

import com.ppms.support.FixedBusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 11, 21, 10, 0, 0, 0, ZoneOffset.ofHoursMinutes(5, 30));
    private static final String RAW_TOKEN = "raw-refresh-token";
    private static final long REFRESH_TOKEN_DAYS = 7;
    private static final long SESSION_MAX_DAYS = 30;

    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private JwtService jwtService;

    private RefreshTokenService service;
    private User user;

    @BeforeEach
    void createService() {
        service = new RefreshTokenService(refreshTokenRepository, userRepository, jwtService,
                new FixedBusinessClock(NOW), REFRESH_TOKEN_DAYS, SESSION_MAX_DAYS);
        user = User.builder()
                .id(7L)
                .fullName("Asha")
                .phoneNumber("9000000001")
                .role(UserRole.MANAGER)
                .status(UserStatus.ACTIVE)
                .tokenVersion(3)
                .build();
        lenient().when(refreshTokenRepository.save(any(RefreshToken.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void loginStartsANewFamilyWithTheUsersTokenVersionAndNeverStoresTheRawToken() {
        IssuedRefreshToken issued = service.startSession(user);

        RefreshToken saved = lastSavedToken();
        assertThat(saved.getUserId()).isEqualTo(7L);
        assertThat(saved.getTokenVersion()).isEqualTo(3);
        assertThat(saved.getTokenHash()).isEqualTo(TokenHashing.sha256Hex(issued.value())).isNotEqualTo(issued.value());
        assertThat(saved.getExpiresAt()).isEqualTo(NOW.plusDays(REFRESH_TOKEN_DAYS));
        assertThat(saved.getFamilyExpiresAt()).isEqualTo(NOW.plusDays(SESSION_MAX_DAYS));
        assertThat(issued.lifetime()).isEqualTo(Duration.ofDays(REFRESH_TOKEN_DAYS));
        assertThat(issued.value()).matches("[A-Za-z0-9_-]{43}");
    }

    @Test
    void refreshMarksTheTokenUsedAndIssuesTheNextOneInTheSameFamily() {
        RefreshToken current = givenStoredToken(validToken());
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));
        when(jwtService.generateAccessToken(user)).thenReturn("new-access-jwt");

        LoginResult result = service.refresh(RAW_TOKEN);

        assertThat(current.getUsedAt()).isEqualTo(NOW);
        RefreshToken next = lastSavedToken();
        assertThat(next.getFamilyId()).isEqualTo(current.getFamilyId());
        assertThat(next.getFamilyExpiresAt()).isEqualTo(current.getFamilyExpiresAt());
        assertThat(next.getTokenHash()).isEqualTo(TokenHashing.sha256Hex(result.refreshToken().value()));
        assertThat(result.refreshToken().value()).isNotEqualTo(RAW_TOKEN);
        assertThat(result.token()).isEqualTo("new-access-jwt");
        assertThat(result.loginResponse().getUserId()).isEqualTo(7L);
    }

    @Test
    void rotatedTokenNeverOutlivesTheSessionCap() {
        RefreshToken current = validToken();
        current.setFamilyExpiresAt(NOW.plusDays(2));
        givenStoredToken(current);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));

        LoginResult result = service.refresh(RAW_TOKEN);

        assertThat(lastSavedToken().getExpiresAt()).isEqualTo(NOW.plusDays(2));
        assertThat(result.refreshToken().lifetime()).isEqualTo(Duration.ofDays(2));
    }

    @Test
    void reusingAUsedTokenRevokesTheFamilyAndEndsEverySessionOfTheUser() {
        RefreshToken used = validToken();
        used.setUsedAt(NOW.minusMinutes(5));
        givenStoredToken(used);
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(user));

        assertSessionExpired();

        verify(refreshTokenRepository).revokeFamily(used.getFamilyId(), NOW);
        assertThat(user.getTokenVersion()).isEqualTo(4);
        verify(userRepository).save(user);
        verify(jwtService, never()).generateAccessToken(any());
    }

    @Test
    void expiredTokenIsRefused() {
        RefreshToken expired = validToken();
        expired.setExpiresAt(NOW);
        givenStoredToken(expired);

        assertSessionExpired();
        assertThat(expired.getUsedAt()).isNull();
    }

    @Test
    void tokenPastTheSessionCapIsRefused() {
        RefreshToken pastCap = validToken();
        pastCap.setFamilyExpiresAt(NOW.minusSeconds(1));
        givenStoredToken(pastCap);

        assertSessionExpired();
    }

    @Test
    void revokedTokenIsRefusedWithoutEndingOtherSessions() {
        RefreshToken revoked = validToken();
        revoked.setUsedAt(NOW.minusMinutes(1));
        revoked.setRevokedAt(NOW.minusMinutes(1));
        givenStoredToken(revoked);

        assertSessionExpired();
        verify(userRepository, never()).findByIdForUpdate(any());
    }

    @Test
    void tokenIssuedBeforeAPasswordChangeIsRefused() {
        RefreshToken current = givenStoredToken(validToken());
        user.setTokenVersion(4);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));

        assertSessionExpired();
        assertThat(current.getUsedAt()).isNull();
    }

    @Test
    void tokenOfAnInactiveUserIsRefused() {
        givenStoredToken(validToken());
        user.setStatus(UserStatus.INACTIVE);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));

        assertSessionExpired();
    }

    @Test
    void unknownOrMissingTokenIsRefused() {
        when(refreshTokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(RAW_TOKEN))).thenReturn(Optional.empty());

        assertSessionExpired();
        assertThatThrownBy(() -> service.refresh(null)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void logoutRevokesTheWholeFamily() {
        RefreshToken current = givenStoredToken(validToken());

        service.endSession(RAW_TOKEN);

        verify(refreshTokenRepository).revokeFamily(current.getFamilyId(), NOW);
    }

    private void assertSessionExpired() {
        assertThatThrownBy(() -> service.refresh(RAW_TOKEN))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage(RefreshTokenService.SESSION_EXPIRED_MESSAGE);
    }

    private RefreshToken validToken() {
        return RefreshToken.builder()
                .id(11L)
                .userId(7L)
                .tokenHash(TokenHashing.sha256Hex(RAW_TOKEN))
                .familyId(UUID.randomUUID())
                .tokenVersion(3)
                .expiresAt(NOW.plusDays(3))
                .familyExpiresAt(NOW.plusDays(20))
                .build();
    }

    private RefreshToken givenStoredToken(RefreshToken token) {
        when(refreshTokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(RAW_TOKEN))).thenReturn(Optional.of(token));
        return token;
    }

    private RefreshToken lastSavedToken() {
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository, atLeastOnce()).save(captor.capture());
        return captor.getValue();
    }
}
