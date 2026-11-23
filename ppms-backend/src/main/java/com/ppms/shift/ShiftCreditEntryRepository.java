package com.ppms.shift;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
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

    @Query("SELECT e FROM ShiftCreditEntry e WHERE e.clientId IN :clientIds AND e.voidStatus = 'ACTIVE'")
    List<ShiftCreditEntry> findActiveByClientIdIn(@Param("clientIds") java.util.Collection<Long> clientIds);

    /**
     * Sale date of the oldest ACTIVE (non-voided) credit entry of the given clients, where the interest grace
     * period starts. A voided first entry was never owed, so it does not start the clock.
     */
    @Query("SELECT MIN(e.saleDate) FROM ShiftCreditEntry e WHERE e.clientId IN :clientIds AND e.voidStatus = 'ACTIVE'")
    Optional<LocalDate> findOldestSaleDateByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** Rows of [clientId, oldest ACTIVE sale date]. */
    @Query("SELECT e.clientId, MIN(e.saleDate) FROM ShiftCreditEntry e WHERE e.clientId IN :clientIds AND e.voidStatus = 'ACTIVE' GROUP BY e.clientId")
    List<Object[]> findOldestSaleDatesByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    boolean existsByClientId(Long clientId);

    /** Waits for an invoice being issued that includes this entry, so the invoice check after it is reliable. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM ShiftCreditEntry e WHERE e.id = :id")
    Optional<ShiftCreditEntry> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM ShiftCreditEntry e WHERE e.id IN :ids ORDER BY e.id")
    List<ShiftCreditEntry> findAllByIdForUpdate(@Param("ids") java.util.Collection<Long> ids);
}
