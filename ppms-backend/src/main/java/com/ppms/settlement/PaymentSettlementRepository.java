package com.ppms.settlement;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface PaymentSettlementRepository extends JpaRepository<PaymentSettlement, Long> {

    /** Paginated settlement history for a pump — newest settlement dates first. */
    Page<PaymentSettlement> findByPumpIdOrderBySettlementDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Paginated settlement history filtered by payment type — newest first. */
    Page<PaymentSettlement> findByPumpIdAndPaymentTypeOrderBySettlementDateDescCreatedAtDesc(
            Long pumpId, SettlementPaymentType paymentType, Pageable pageable);

    /** All settlements for a pump on a specific date — used for balance sheet drill-down. */
    List<PaymentSettlement> findByPumpIdAndSettlementDateOrderByCreatedAtDesc(Long pumpId, LocalDate settlementDate);

    /** All settlements for a pump within a date range — used for the daily-summary endpoint. */
    List<PaymentSettlement> findByPumpIdAndSettlementDateBetweenOrderBySettlementDateAscCreatedAtAsc(
            Long pumpId, LocalDate from, LocalDate to);

    /**
     * Total amount settled for a pump + payment type across ALL time.
     * Used in wallet balance calculation: walletPending = totalCollected − totalSettled.
     * COALESCE(SUM(...), 0) guarantees a non-null result even when no settlements exist.
     */
    @Query("""
            SELECT COALESCE(SUM(ps.amountReceived), 0)
            FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId AND ps.paymentType = :paymentType
            """)
    BigDecimal sumAmountByPumpIdAndPaymentType(
            @Param("pumpId") Long pumpId,
            @Param("paymentType") SettlementPaymentType paymentType);

    /**
     * Total amount settled for a pump + payment type on or before a given date.
     * Used for historical wallet snapshot on balance sheets (as of reportDate).
     */
    @Query("""
            SELECT COALESCE(SUM(ps.amountReceived), 0)
            FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId
              AND ps.paymentType = :paymentType
              AND ps.settlementDate <= :asOf
            """)
    BigDecimal sumAmountByPumpIdAndPaymentTypeAsOf(
            @Param("pumpId") Long pumpId,
            @Param("paymentType") SettlementPaymentType paymentType,
            @Param("asOf") LocalDate asOf);
}
