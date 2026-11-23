package com.ppms.invoice;

import com.ppms.ancillary.AncillarySale;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.transaction.TransactionPaymentMode;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

@Repository
public interface CreditInvoiceLineRepository extends JpaRepository<CreditInvoiceLine, Long> {

    List<CreditInvoiceLine> findByInvoiceIdOrderByLineTypeAscSaleDateAscIdAsc(Long invoiceId);

    /**
     * Active fuel credit entries of the client sold in the period that are not on an issued invoice.
     * Locked so a void or reassignment waits for the invoice and then sees it.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM ShiftCreditEntry e WHERE e.clientId = :clientId AND e.voidStatus = 'ACTIVE' "
            + "AND e.saleDate BETWEEN :from AND :to "
            + "AND NOT EXISTS (SELECT l.id FROM CreditInvoiceLine l "
            + "WHERE l.lineType = com.ppms.invoice.InvoiceLineType.FUEL AND l.sourceId = e.id AND l.isActive = true) "
            + "ORDER BY e.saleDate ASC, e.id ASC")
    List<ShiftCreditEntry> findUninvoicedFuelEntries(@Param("clientId") Long clientId,
                                                     @Param("from") LocalDate from,
                                                     @Param("to") LocalDate to);

    /** Counter sales of the client in the given payment mode, dated in the period, that are not on an issued invoice. */
    @Query("SELECT s FROM AncillarySale s WHERE s.pumpId = :pumpId AND s.clientId = :clientId "
            + "AND s.paymentMode = :paymentMode "
            + "AND s.saleDate BETWEEN :from AND :to "
            + "AND NOT EXISTS (SELECT l.id FROM CreditInvoiceLine l "
            + "WHERE l.lineType = com.ppms.invoice.InvoiceLineType.ANCILLARY AND l.sourceId = s.id AND l.isActive = true) "
            + "ORDER BY s.saleDate ASC, s.id ASC")
    List<AncillarySale> findUninvoicedAncillarySales(@Param("pumpId") Long pumpId,
                                                     @Param("clientId") Long clientId,
                                                     @Param("paymentMode") TransactionPaymentMode paymentMode,
                                                     @Param("from") LocalDate from,
                                                     @Param("to") LocalDate to);

    /** {@link #findUninvoicedFuelEntries} for every client of the pump at once, without locking — for a preview. */
    @Query("SELECT e FROM ShiftCreditEntry e, CreditClient c WHERE c.id = e.clientId AND c.pumpId = :pumpId "
            + "AND e.voidStatus = 'ACTIVE' AND e.saleDate BETWEEN :from AND :to "
            + "AND NOT EXISTS (SELECT l.id FROM CreditInvoiceLine l "
            + "WHERE l.lineType = com.ppms.invoice.InvoiceLineType.FUEL AND l.sourceId = e.id AND l.isActive = true) "
            + "ORDER BY e.saleDate ASC, e.id ASC")
    List<ShiftCreditEntry> findUninvoicedFuelEntriesOfPump(@Param("pumpId") Long pumpId,
                                                           @Param("from") LocalDate from,
                                                           @Param("to") LocalDate to);

    /** {@link #findUninvoicedAncillarySales} for every client of the pump at once — for a preview. */
    @Query("SELECT s FROM AncillarySale s WHERE s.pumpId = :pumpId "
            + "AND s.clientId IN (SELECT c.id FROM CreditClient c WHERE c.pumpId = :pumpId) "
            + "AND s.paymentMode = :paymentMode "
            + "AND s.saleDate BETWEEN :from AND :to "
            + "AND NOT EXISTS (SELECT l.id FROM CreditInvoiceLine l "
            + "WHERE l.lineType = com.ppms.invoice.InvoiceLineType.ANCILLARY AND l.sourceId = s.id AND l.isActive = true) "
            + "ORDER BY s.saleDate ASC, s.id ASC")
    List<AncillarySale> findUninvoicedAncillarySalesOfPump(@Param("pumpId") Long pumpId,
                                                           @Param("paymentMode") TransactionPaymentMode paymentMode,
                                                           @Param("from") LocalDate from,
                                                           @Param("to") LocalDate to);

    @Query("SELECT i.invoiceNumber FROM CreditInvoiceLine l, CreditInvoice i WHERE i.id = l.invoiceId "
            + "AND l.isActive = true AND l.lineType = :lineType AND l.sourceId IN :sourceIds ORDER BY i.invoiceNumber")
    List<String> findActiveInvoiceNumbersOfSources(@Param("lineType") InvoiceLineType lineType,
                                                   @Param("sourceIds") Collection<Long> sourceIds);

    @Modifying
    @Query("UPDATE CreditInvoiceLine l SET l.isActive = false WHERE l.invoiceId = :invoiceId")
    int releaseLinesOfInvoice(@Param("invoiceId") Long invoiceId);
}
