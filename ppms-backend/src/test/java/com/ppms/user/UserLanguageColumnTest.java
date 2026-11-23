package com.ppms.user;

import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.support.TestDates;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
class UserLanguageColumnTest {

    @Autowired private UserRepository userRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void userSavedWithoutALanguageIsStoredAsEnglish() {
        User user = userRepository.saveAndFlush(newUser("9000000101"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT preferred_language FROM users WHERE id = ?", String.class, user.getId())).isEqualTo("en");
    }

    @Test
    void hindiAndMarathiAreAcceptedButOtherLanguagesAreRefused() {
        User user = userRepository.saveAndFlush(newUser("9000000102"));

        jdbcTemplate.update("UPDATE users SET preferred_language = 'hi' WHERE id = ?", user.getId());
        jdbcTemplate.update("UPDATE users SET preferred_language = 'mr' WHERE id = ?", user.getId());
        assertThatThrownBy(() -> jdbcTemplate.update("UPDATE users SET preferred_language = 'fr' WHERE id = ?", user.getId()))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_users_preferred_language");
    }

    private static User newUser(String phoneNumber) {
        return User.builder()
                .employeeId("EMP-" + phoneNumber)
                .fullName("Language User")
                .phoneNumber(phoneNumber)
                .passwordHash("hash")
                .role(UserRole.OWNER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build();
    }
}
