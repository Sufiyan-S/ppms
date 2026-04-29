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

    /** All interest charges for a client, newest first — used for the ledger transaction list. */
    List<CreditInterestCharge> findByClientIdOrderByCreatedAtDesc(Long clientId);

    /** Total interest charged to a client — included in outstanding balance calculation. */
    @Query("SELECT COALESCE(SUM(c.amount), 0) FROM CreditInterestCharge c WHERE c.clientId = :clientId")
    BigDecimal sumAmountByClientId(@Param("clientId") Long clientId);

    /**
     * Date of the most recent interest charge for a client.
     * Used to determine the start of the next chargeable period (last period_to + 1 day).
     */
    @Query("SELECT MAX(c.periodTo) FROM CreditInterestCharge c WHERE c.clientId = :clientId")
    Optional<java.time.LocalDate> findLastPeriodToByClientId(@Param("clientId") Long clientId);

    /** Batch sum of interest charges per client — used for efficient outstanding balance calculation across all clients. */
    @Query("SELECT c.clientId, COALESCE(SUM(c.amount), 0) FROM CreditInterestCharge c WHERE c.clientId IN :clientIds GROUP BY c.clientId")
    List<Object[]> sumAmountsByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** All interest charges for a set of clients — used for chronological interest-first allocation simulation. */
    List<CreditInterestCharge> findByClientIdIn(java.util.Collection<Long> clientIds);

    /**
     * All interest charges for a pump within a period_from date range, sorted oldest first.
     * Used by the Interest Accrual Report — finds charges whose period starts within [from, to].
     */
    @Query("""
            SELECT c FROM CreditInterestCharge c
            WHERE c.pumpId = :pumpId
              AND c.periodFrom >= :from
              AND c.periodFrom <= :to
            ORDER BY c.periodFrom ASC, c.clientId ASC
            """)
    List<CreditInterestCharge> findByPumpIdAndPeriodFromBetween(
            @Param("pumpId") Long pumpId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
