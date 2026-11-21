package com.ppms.auth;

import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
class RefreshTokenRepositoryTest {

    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private TestEntityManager entityManager;

    private final OffsetDateTime now = TestDates.now();
    private User user;

    @BeforeEach
    void createUser() {
        user = userRepository.save(User.builder()
                .employeeId("EMP-REFRESH")
                .fullName("Refresh User")
                .phoneNumber("9000000002")
                .passwordHash("hash")
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
    }

    @Test
    void revokeFamilyRevokesOnlyLiveTokensOfThatFamily() {
        UUID family = UUID.randomUUID();
        RefreshToken first = save(family, now.plusDays(7), null);
        RefreshToken second = save(family, now.plusDays(7), null);
        RefreshToken otherFamily = save(UUID.randomUUID(), now.plusDays(7), null);

        int revoked = refreshTokenRepository.revokeFamily(family, now);
        entityManager.clear();

        assertThat(revoked).isEqualTo(2);
        assertThat(refreshTokenRepository.findById(first.getId()).orElseThrow().getRevokedAt()).isNotNull();
        assertThat(refreshTokenRepository.findById(second.getId()).orElseThrow().getRevokedAt()).isNotNull();
        assertThat(refreshTokenRepository.findById(otherFamily.getId()).orElseThrow().getRevokedAt()).isNull();
    }

    @Test
    void cleanupDeletesTokensExpiredOrRevokedBeforeTheCutoffInBatches() {
        OffsetDateTime cutoff = now.minusDays(1);
        RefreshToken longExpired = save(UUID.randomUUID(), now.minusDays(2), null);
        RefreshToken longRevoked = save(UUID.randomUUID(), now.plusDays(5), now.minusDays(2));
        RefreshToken justRevoked = save(UUID.randomUUID(), now.plusDays(5), now.minusHours(1));
        RefreshToken live = save(UUID.randomUUID(), now.plusDays(5), null);

        assertThat(refreshTokenRepository.deleteExpiredOrRevokedBefore(cutoff, 1)).isEqualTo(1);
        assertThat(refreshTokenRepository.deleteExpiredOrRevokedBefore(cutoff, 10)).isEqualTo(1);
        entityManager.clear();

        assertThat(refreshTokenRepository.findById(longExpired.getId())).isEmpty();
        assertThat(refreshTokenRepository.findById(longRevoked.getId())).isEmpty();
        assertThat(refreshTokenRepository.findById(justRevoked.getId())).isPresent();
        assertThat(refreshTokenRepository.findById(live.getId())).isPresent();
    }

    @Test
    void findsTokenByHashOnly() {
        RefreshToken token = save(UUID.randomUUID(), now.plusDays(7), null);

        assertThat(refreshTokenRepository.findByTokenHashForUpdate(token.getTokenHash())).isPresent();
        assertThat(refreshTokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex("unknown"))).isEmpty();
    }

    private RefreshToken save(UUID familyId, OffsetDateTime expiresAt, OffsetDateTime revokedAt) {
        return refreshTokenRepository.saveAndFlush(RefreshToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHashing.sha256Hex(UUID.randomUUID().toString()))
                .familyId(familyId)
                .tokenVersion(0)
                .expiresAt(expiresAt)
                .familyExpiresAt(now.plusDays(30))
                .revokedAt(revokedAt)
                .build());
    }
}
