package com.ppms.supplier;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface FuelSupplierPaymentRepository extends JpaRepository<FuelSupplierPayment, Long> {

    /** Returns paginated payments for a pump, newest first. */
    Page<FuelSupplierPayment> findByPumpIdOrderByPaymentDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Returns paginated payments to a specific supplier, newest first. */
    Page<FuelSupplierPayment> findByPumpIdAndSupplierIdOrderByPaymentDateDesc(Long pumpId, Long supplierId, Pageable pageable);

    /** Total amount paid to a supplier by a pump — used for outstanding dues calculation. */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM FuelSupplierPayment p WHERE p.pumpId = :pumpId AND p.supplierId = :supplierId")
    BigDecimal sumAmountByPumpAndSupplier(@Param("pumpId") Long pumpId, @Param("supplierId") Long supplierId);
}
