package com.ppms.common.idempotency;

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

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(PostgresTestContainerConfig.class)
class IdempotencyKeyRepositoryTest {

    @Autowired private IdempotencyKeyRepository idempotencyKeyRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private TestEntityManager entityManager;

    private final OffsetDateTime now = TestDates.now();
    private User user;

    @BeforeEach
    void createUser() {
        user = userRepository.save(User.builder()
                .employeeId("EMP-IDEMPOTENCY")
                .fullName("Idempotency User")
                .phoneNumber("9000000071")
                .passwordHash("hash")
                .role(UserRole.MANAGER)
                .status(UserStatus.ACTIVE)
                .dateOfJoining(TestDates.today())
                .build());
    }

    @Test
    void storedResponseBodyReadsBackAsTheSameJson() {
        IdempotencyKey saved = save("key-json-01", now);
        entityManager.clear();

        IdempotencyKey found = idempotencyKeyRepository.findByUserIdAndKey(user.getId(), "key-json-01").orElseThrow();

        assertThat(found.getId()).isEqualTo(saved.getId());
        assertThat(found.getResponseBody()).isEqualTo("{\"id\": 7}");
        assertThat(found.getResponseStatus()).isEqualTo(200);
    }

    @Test
    void deleteCreatedBeforeRemovesOnlyOlderKeysUpToTheBatchSize() {
        IdempotencyKey oldest = save("key-old-001", now.minusHours(72));
        IdempotencyKey older = save("key-old-002", now.minusHours(50));
        IdempotencyKey recent = save("key-new-001", now.minusHours(2));

        int firstBatch = idempotencyKeyRepository.deleteCreatedBefore(now.minusHours(48), 1);
        int secondBatch = idempotencyKeyRepository.deleteCreatedBefore(now.minusHours(48), 1);
        int thirdBatch = idempotencyKeyRepository.deleteCreatedBefore(now.minusHours(48), 1);
        entityManager.clear();

        assertThat(firstBatch + secondBatch).isEqualTo(2);
        assertThat(thirdBatch).isZero();
        assertThat(idempotencyKeyRepository.findById(oldest.getId())).isEmpty();
        assertThat(idempotencyKeyRepository.findById(older.getId())).isEmpty();
        assertThat(idempotencyKeyRepository.findById(recent.getId())).isPresent();
    }

    private IdempotencyKey save(String key, OffsetDateTime createdAt) {
        IdempotencyKey saved = idempotencyKeyRepository.saveAndFlush(IdempotencyKey.builder()
                .key(key)
                .userId(user.getId())
                .endpoint("POST /api/pumps/1/shifts/2/close")
                .requestHash("a".repeat(64))
                .responseStatus(200)
                .responseBody("{\"id\":7}")
                .build());
        entityManager.getEntityManager()
                .createNativeQuery("UPDATE idempotency_keys SET created_at = :createdAt WHERE id = :id")
                .setParameter("createdAt", createdAt)
                .setParameter("id", saved.getId())
                .executeUpdate();
        return saved;
    }
}
