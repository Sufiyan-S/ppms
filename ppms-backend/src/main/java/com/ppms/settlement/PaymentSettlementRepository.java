package com.ppms.settlement;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentSettlementRepository extends JpaRepository<PaymentSettlement, Long> {

    /** Paginated settlement history for a pump — newest settlement dates first. */
    Page<PaymentSettlement> findByPumpIdOrderBySettlementDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Paginated settlement history filtered by payment type — newest first. */
    Page<PaymentSettlement> findByPumpIdAndPaymentTypeOrderBySettlementDateDescCreatedAtDesc(
            Long pumpId, SettlementPaymentType paymentType, Pageable pageable);

    /** ACTIVE settlements for a pump on a specific date — used for balance sheet drill-down. */
    @Query("""
            SELECT ps FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId AND ps.settlementDate = :settlementDate AND ps.voidStatus = 'ACTIVE'
            ORDER BY ps.createdAt DESC
            """)
    List<PaymentSettlement> findActiveByPumpIdAndSettlementDate(
            @Param("pumpId") Long pumpId,
            @Param("settlementDate") LocalDate settlementDate);

    /** Settlements of every status within a date range, oldest first — voided ones are listed for the record. */
    @Query("""
            SELECT ps FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId AND ps.settlementDate BETWEEN :from AND :to
            ORDER BY ps.settlementDate ASC, ps.createdAt ASC
            """)
    List<PaymentSettlement> findAllByPumpIdAndSettlementDateBetween(
            @Param("pumpId") Long pumpId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    /**
     * Total ACTIVE amount settled for a pump + payment type across ALL time.
     * Used in wallet balance calculation: walletPending = totalCollected − totalSettled.
     */
    @Query("""
            SELECT COALESCE(SUM(ps.amountReceived), 0)
            FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId AND ps.paymentType = :paymentType AND ps.voidStatus = 'ACTIVE'
            """)
    BigDecimal sumAmountByPumpIdAndPaymentType(
            @Param("pumpId") Long pumpId,
            @Param("paymentType") SettlementPaymentType paymentType);

    /**
     * Total ACTIVE amount settled for a pump + payment type on or before a given date.
     * Used for historical wallet snapshot on balance sheets (as of reportDate).
     */
    @Query("""
            SELECT COALESCE(SUM(ps.amountReceived), 0)
            FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId
              AND ps.paymentType = :paymentType
              AND ps.settlementDate <= :asOf
              AND ps.voidStatus = 'ACTIVE'
            """)
    BigDecimal sumAmountByPumpIdAndPaymentTypeAsOf(
            @Param("pumpId") Long pumpId,
            @Param("paymentType") SettlementPaymentType paymentType,
            @Param("asOf") LocalDate asOf);

    /** Detects a double submission: the same ACTIVE settlement recorded again shortly after the first. */
    @Query("""
            SELECT COUNT(ps) > 0 FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId
              AND ps.paymentType = :paymentType
              AND ps.settlementDate = :settlementDate
              AND ps.amountReceived = :amount
              AND ps.voidStatus = 'ACTIVE'
              AND ps.createdAt > :createdAfter
            """)
    boolean existsRecentDuplicate(
            @Param("pumpId") Long pumpId,
            @Param("paymentType") SettlementPaymentType paymentType,
            @Param("settlementDate") LocalDate settlementDate,
            @Param("amount") BigDecimal amount,
            @Param("createdAfter") OffsetDateTime createdAfter);

    Optional<PaymentSettlement> findByIdAndPumpId(Long id, Long pumpId);

    @Query("""
            SELECT COUNT(ps) > 0 FROM PaymentSettlement ps
            WHERE ps.pumpId = :pumpId
              AND UPPER(ps.bankReference) = UPPER(:bankReference)
              AND ps.voidStatus = 'ACTIVE'
            """)
    boolean existsActiveWithBankReference(@Param("pumpId") Long pumpId, @Param("bankReference") String bankReference);
}
