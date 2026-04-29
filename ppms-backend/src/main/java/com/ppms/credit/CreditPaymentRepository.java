package com.ppms.credit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ppms.expense.ExpenseApprovalStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface CreditPaymentRepository extends JpaRepository<CreditPayment, Long> {

    // Returns all payments for a client, newest first — used for the ledger transaction list
    List<CreditPayment> findByClientIdOrderByPaidAtDesc(Long clientId);

    /**
     * Total APPROVED payments made by a client.
     * Excludes PENDING_APPROVAL and REJECTED payments so they don't reduce the outstanding balance
     * until explicitly approved by Owner/Admin.
     */
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM CreditPayment p WHERE p.clientId = :clientId AND p.paymentApprovalStatus = 'APPROVED'")
    BigDecimal sumAmountByClientId(@Param("clientId") Long clientId);

    // Total APPROVED credit recovered for a pump on a specific date — used in DAY balance sheet
    @Query("SELECT COALESCE(SUM(p.amount), 0) FROM CreditPayment p WHERE p.pumpId = :pumpId AND p.paidAt = :date AND p.paymentApprovalStatus = 'APPROVED'")
    BigDecimal sumAmountByPumpIdAndDate(@Param("pumpId") Long pumpId, @Param("date") LocalDate date);

    // Most recent APPROVED payment date for a client — used for billing cycle overdue detection
    @Query("SELECT MAX(p.paidAt) FROM CreditPayment p WHERE p.clientId = :clientId AND p.paymentApprovalStatus = 'APPROVED'")
    Optional<LocalDate> findLastPaymentDateByClientId(@Param("clientId") Long clientId);

    /**
     * Batch sum of APPROVED payments per client.
     * Used for efficient outstanding balance calculation across all clients.
     * Excludes PENDING_APPROVAL and REJECTED so they don't affect balances.
     */
    @Query("SELECT p.clientId, COALESCE(SUM(p.amount), 0) FROM CreditPayment p WHERE p.clientId IN :clientIds AND p.paymentApprovalStatus = 'APPROVED' GROUP BY p.clientId")
    List<Object[]> sumAmountsByClientIds(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** All APPROVED payments for a set of clients — used for chronological interest-first allocation simulation. */
    @Query("SELECT p FROM CreditPayment p WHERE p.clientId IN :clientIds AND p.paymentApprovalStatus = 'APPROVED'")
    List<CreditPayment> findApprovedByClientIdIn(@Param("clientIds") java.util.Collection<Long> clientIds);

    /** Returns all payments pending approval for a pump — for Owner/Admin approval queue. */
    @Query("SELECT p FROM CreditPayment p WHERE p.pumpId = :pumpId AND p.paymentApprovalStatus = 'PENDING_APPROVAL' ORDER BY p.createdAt ASC")
    List<CreditPayment> findPendingApprovalByPumpId(@Param("pumpId") Long pumpId);
}
