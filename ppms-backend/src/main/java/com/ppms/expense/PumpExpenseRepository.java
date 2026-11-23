package com.ppms.expense;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface PumpExpenseRepository extends JpaRepository<PumpExpense, Long> {

    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM PumpExpense e WHERE e.pumpId = :pumpId AND e.approvalStatus = :status")
    BigDecimal sumAmountByPumpIdAndApprovalStatus(@Param("pumpId") Long pumpId,
                                                  @Param("status") ExpenseApprovalStatus status);

    /** Approved and pending expenses of one category on one day; drafts and rejected expenses are not counted. */
    @Query("""
            SELECT COALESCE(SUM(e.amount), 0) FROM PumpExpense e
            WHERE e.pumpId = :pumpId AND e.category = :category AND e.expenseDate = :expenseDate
              AND e.approvalStatus IN ('APPROVED', 'PENDING_APPROVAL')
            """)
    BigDecimal sumSubmittedAmountByPumpIdAndCategoryAndExpenseDate(@Param("pumpId") Long pumpId,
                                                                   @Param("category") ExpenseCategory category,
                                                                   @Param("expenseDate") LocalDate expenseDate);

    long countByPumpIdAndApprovalStatus(Long pumpId, ExpenseApprovalStatus approvalStatus);

    /** Oldest first — the approval queue. */
    List<PumpExpense> findByPumpIdAndApprovalStatusOrderByCreatedAtAsc(Long pumpId, ExpenseApprovalStatus approvalStatus);

    /** Expenses dated within [from, to], both days included — used by reports and CSV export. */
    List<PumpExpense> findByPumpIdAndExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(
            Long pumpId, LocalDate from, LocalDate to);

    /** Paginated — use for the API. */
    Page<PumpExpense> findByPumpIdOrderByExpenseDateDescCreatedAtDesc(Long pumpId, Pageable pageable);

    /** Filter by category only. */
    Page<PumpExpense> findByPumpIdAndCategoryOrderByExpenseDateDescCreatedAtDesc(
            Long pumpId, ExpenseCategory category, Pageable pageable);

    /** Filter by approval status only. */
    Page<PumpExpense> findByPumpIdAndApprovalStatusOrderByExpenseDateDescCreatedAtDesc(
            Long pumpId, ExpenseApprovalStatus approvalStatus, Pageable pageable);

    /** Filter by both category and approval status. */
    Page<PumpExpense> findByPumpIdAndCategoryAndApprovalStatusOrderByExpenseDateDescCreatedAtDesc(
            Long pumpId, ExpenseCategory category, ExpenseApprovalStatus approvalStatus, Pageable pageable);

    /** Fetch approved expenses for a specific pump and date — used by balance sheet DAY reports. */
    List<PumpExpense> findByPumpIdAndExpenseDateAndApprovalStatus(
            Long pumpId, LocalDate expenseDate, ExpenseApprovalStatus approvalStatus);
}
