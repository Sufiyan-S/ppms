package com.ppms.shift;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface ShiftCreditEntryRepository extends JpaRepository<ShiftCreditEntry, Long> {

    List<ShiftCreditEntry> findByShiftId(Long shiftId);

    /** Batch fetch for all credit entries across multiple shifts — avoids N+1 in balance sheet generation. */
    List<ShiftCreditEntry> findByShiftIdIn(java.util.Collection<Long> shiftIds);

    // Returns all credit entries for a specific client — used for the ledger transaction list
    List<ShiftCreditEntry> findByClientIdOrderByCreatedAtDesc(Long clientId);

    /**
     * Total ACTIVE (non-voided) credit sales for a client.
     * Used to compute the outstanding balance. Voided entries are intentionally excluded —
     * they represent cancelled transactions and must not inflate the balance.
     */
    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM ShiftCreditEntry e WHERE e.clientId = :clientId AND e.voidStatus = 'ACTIVE'")
    BigDecimal sumAmountByClientId(@Param("clientId") Long clientId);

    /**
     * Batch sum of ACTIVE credit sales per client.
     * Voided entries are excluded — same reasoning as sumAmountByClientId.
     */
    @Query("SELECT e.clientId, COALESCE(SUM(e.amount), 0) FROM ShiftCreditEntry e WHERE e.clientId IN :clientIds AND e.voidStatus = 'ACTIVE' GROUP BY e.clientId")
    List<Object[]> sumAmountsByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /**
     * Date of the oldest ACTIVE (non-voided) credit entry for a client.
     * Used by the interest calculator to determine when the grace period starts.
     * Voided entries are excluded — if a client's first-ever entry was later voided,
     * the interest clock should start from the first real (non-cancelled) transaction,
     * not from a phantom one that was reversed before any debt was owed.
     * Returns empty if the client has no active credit entries yet.
     */
    @Query("SELECT MIN(e.createdAt) FROM ShiftCreditEntry e WHERE e.clientId = :clientId AND e.voidStatus = 'ACTIVE'")
    Optional<OffsetDateTime> findOldestEntryDateByClientId(@Param("clientId") Long clientId);
}
