package com.ppms.credit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CreditInterestChargeRepository extends JpaRepository<CreditInterestCharge, Long> {

    /** All interest charges for a client, waived ones included, newest first — used for the ledger transaction list. */
    List<CreditInterestCharge> findByClientIdOrderByCreatedAtDesc(Long clientId);

    /** Total live (not waived) interest charged to a client — included in outstanding balance calculation. */
    @Query("SELECT COALESCE(SUM(c.amount), 0) FROM CreditInterestCharge c WHERE c.clientId = :clientId AND c.voidedAt IS NULL")
    BigDecimal sumAmountByClientId(@Param("clientId") Long clientId);

    /**
     * Last day covered by a live (not waived) charge of any of the given clients; the next chargeable period
     * starts the day after, so a waived latest charge leaves its period open to be charged again.
     */
    @Query("SELECT MAX(c.periodTo) FROM CreditInterestCharge c WHERE c.clientId IN :clientIds AND c.voidedAt IS NULL")
    Optional<LocalDate> findLastPeriodToByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** Live charges of the given clients whose period ends on or after {@code date}, oldest period first. */
    @Query("""
            SELECT c FROM CreditInterestCharge c
            WHERE c.clientId IN :clientIds AND c.voidedAt IS NULL AND c.periodTo >= :date
            ORDER BY c.periodFrom ASC, c.periodTo ASC
            """)
    List<CreditInterestCharge> findLiveEndingOnOrAfter(@Param("clientIds") java.util.Collection<Long> clientIds,
                                                       @Param("date") LocalDate date);

    /** Batch sum of live interest charges per client — used for efficient outstanding balance calculation across all clients. */
    @Query("SELECT c.clientId, COALESCE(SUM(c.amount), 0) FROM CreditInterestCharge c WHERE c.clientId IN :clientIds AND c.voidedAt IS NULL GROUP BY c.clientId")
    List<Object[]> sumAmountsByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** Live interest charges for a set of clients — used for chronological interest-first allocation simulation. */
    List<CreditInterestCharge> findByClientIdInAndVoidedAtIsNull(java.util.Collection<Long> clientIds);

    /**
     * Live interest charges for a pump within a period_from date range, sorted oldest first.
     * Used by the Interest Accrual Report — finds charges whose period starts within [from, to].
     */
    @Query("""
            SELECT c FROM CreditInterestCharge c
            WHERE c.pumpId = :pumpId
              AND c.voidedAt IS NULL
              AND c.periodFrom >= :from
              AND c.periodFrom <= :to
            ORDER BY c.periodFrom ASC, c.clientId ASC
            """)
    List<CreditInterestCharge> findByPumpIdAndPeriodFromBetween(
            @Param("pumpId") Long pumpId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    boolean existsByClientId(Long clientId);
}
