package com.ppms.auth;

import com.ppms.support.TestDates;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
class PasswordResetTokenRepositoryTest {

    @Autowired private PasswordResetTokenRepository tokenRepository;
    @Autowired private UserRepository userRepository;

    @Test
    void findsTokenByHashOfRawTokenAndNeverStoresRawToken() {
        User user = userRepository.save(User.builder()
                .employeeId("EMP-RESET")
                .fullName("Reset User")
                .phoneNumber("9000000001")
                .passwordHash("hash")
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
        String rawToken = UUID.randomUUID().toString();
        tokenRepository.save(PasswordResetToken.builder()
                .userId(user.getId())
                .tokenHash(TokenHashing.sha256Hex(rawToken))
                .expiresAt(TestDates.now().plusHours(1))
                .build());

        assertThat(tokenRepository.findByTokenHashForUpdate(TokenHashing.sha256Hex(rawToken))).isPresent();
        assertThat(tokenRepository.findByTokenHashForUpdate(rawToken)).isEmpty();
    }
}
