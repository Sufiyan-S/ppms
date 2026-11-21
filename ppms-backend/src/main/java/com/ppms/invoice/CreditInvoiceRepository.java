package com.ppms.invoice;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CreditInvoiceRepository extends JpaRepository<CreditInvoice, Long> {

    Page<CreditInvoice> findByPumpIdOrderByIssuedOnDescIdDesc(Long pumpId, Pageable pageable);

    Page<CreditInvoice> findByPumpIdAndClientIdOrderByIssuedOnDescIdDesc(Long pumpId, Long clientId, Pageable pageable);

    Optional<CreditInvoice> findByIdAndPumpId(Long id, Long pumpId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM CreditInvoice i WHERE i.id = :id AND i.pumpId = :pumpId")
    Optional<CreditInvoice> findByIdAndPumpIdForUpdate(@Param("id") Long id, @Param("pumpId") Long pumpId);
}
