package com.ppms.common.idempotency;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;

public interface IdempotencyKeyRepository extends JpaRepository<IdempotencyKey, Long> {

    Optional<IdempotencyKey> findByUserIdAndKey(Long userId, String key);

    /** Takes a lock held until the current transaction ends; false when another transaction holds it. */
    @Query(value = "SELECT pg_try_advisory_xact_lock(hashtextextended(:lockName, 0))", nativeQuery = true)
    boolean tryLockUntilTransactionEnds(@Param("lockName") String lockName);

    /** Deletes up to {@code batchSize} keys created before {@code cutoff}. */
    @Modifying
    @Query(value = """
            DELETE FROM idempotency_keys
            WHERE id IN (
                SELECT id FROM idempotency_keys
                WHERE created_at < :cutoff
                LIMIT :batchSize
            )
            """, nativeQuery = true)
    int deleteCreatedBefore(@Param("cutoff") OffsetDateTime cutoff, @Param("batchSize") int batchSize);
}
