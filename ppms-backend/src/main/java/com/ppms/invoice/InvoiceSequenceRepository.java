package com.ppms.invoice;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface InvoiceSequenceRepository extends JpaRepository<InvoiceSequence, InvoiceSequence.Key> {

    /** Creates the year's counter if it is missing; a concurrent creator waits and then does nothing. */
    @Modifying
    @Query(value = "INSERT INTO invoice_sequences (pump_id, financial_year, next_number) "
            + "VALUES (:pumpId, :financialYear, 1) ON CONFLICT DO NOTHING", nativeQuery = true)
    void createIfMissing(@Param("pumpId") Long pumpId, @Param("financialYear") String financialYear);

    /** Held until the issuing transaction ends, so invoices of one pump are numbered one at a time. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM InvoiceSequence s WHERE s.id = :id")
    Optional<InvoiceSequence> findByIdForUpdate(@Param("id") InvoiceSequence.Key id);
}
