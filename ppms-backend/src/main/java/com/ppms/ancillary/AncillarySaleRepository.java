package com.ppms.ancillary;

import com.ppms.transaction.TransactionPaymentMode;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface AncillarySaleRepository extends JpaRepository<AncillarySale, Long> {

    List<AncillarySale> findByPumpIdOrderBySaleDateDescCreatedAtDesc(Long pumpId);

    Page<AncillarySale> findByPumpIdOrderBySaleDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    List<AncillarySale> findByPumpIdAndSaleDateBetweenOrderBySaleDateAsc(Long pumpId, LocalDate from, LocalDate to);

    @Query("SELECT s FROM AncillarySale s WHERE s.pumpId = :pumpId AND s.saleDate BETWEEN :from AND :to ORDER BY s.saleDate ASC")
    List<AncillarySale> findByPumpIdAndDateRange(Long pumpId, LocalDate from, LocalDate to);

    boolean existsByClientId(Long clientId);

    /** Total of a client's sales in one payment mode; for CREDIT this is what the client owes, tax included. */
    @Query("SELECT COALESCE(SUM(s.totalWithGst), 0) FROM AncillarySale s WHERE s.clientId = :clientId "
            + "AND s.paymentMode = :paymentMode")
    BigDecimal sumAmountByClientIdAndPaymentMode(@Param("clientId") Long clientId,
                                                 @Param("paymentMode") TransactionPaymentMode paymentMode);

    @Query("SELECT s.clientId, COALESCE(SUM(s.totalWithGst), 0) FROM AncillarySale s WHERE s.clientId IN :clientIds "
            + "AND s.paymentMode = :paymentMode GROUP BY s.clientId")
    List<Object[]> sumAmountsByClientIdsAndPaymentMode(@Param("clientIds") Collection<Long> clientIds,
                                                      @Param("paymentMode") TransactionPaymentMode paymentMode);

    @Query("SELECT s FROM AncillarySale s WHERE s.clientId IN :clientIds AND s.paymentMode = :paymentMode "
            + "ORDER BY s.saleDate ASC, s.id ASC")
    List<AncillarySale> findByClientIdsAndPaymentMode(@Param("clientIds") Collection<Long> clientIds,
                                                      @Param("paymentMode") TransactionPaymentMode paymentMode);

    @Query("SELECT MIN(s.saleDate) FROM AncillarySale s WHERE s.clientId IN :clientIds AND s.paymentMode = :paymentMode")
    Optional<LocalDate> findOldestSaleDateByClientIdsAndPaymentMode(@Param("clientIds") Collection<Long> clientIds,
                                                                    @Param("paymentMode") TransactionPaymentMode paymentMode);

    /** Rows of [clientId, oldest sale date] in one payment mode. */
    @Query("SELECT s.clientId, MIN(s.saleDate) FROM AncillarySale s WHERE s.clientId IN :clientIds "
            + "AND s.paymentMode = :paymentMode GROUP BY s.clientId")
    List<Object[]> findOldestSaleDatesByClientIdsAndPaymentMode(@Param("clientIds") Collection<Long> clientIds,
                                                                @Param("paymentMode") TransactionPaymentMode paymentMode);

    boolean existsByIdAndPumpId(Long id, Long pumpId);
}
