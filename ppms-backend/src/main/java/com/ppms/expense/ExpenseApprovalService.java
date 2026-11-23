package com.ppms.expense;

import java.util.Map;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Approves or rejects one pending expense and records the decision in the audit log, in one transaction. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ExpenseApprovalService {

    private final PumpExpenseRepository expenseRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    @Transactional
    public PumpExpense review(Long pumpId, Long expenseId, ExpenseApprovalStatus action, String notes, User reviewer) {
        PumpExpense expense = expenseRepository.findById(expenseId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.EXPENSE, "Expense not found"));

        if (expense.getApprovalStatus() != ExpenseApprovalStatus.PENDING_APPROVAL) {
            throw new BusinessException(ErrorCodes.EXPENSE_NOT_PENDING_APPROVAL,
                    Map.of("statusCode", expense.getApprovalStatus().name()),
                    "Expense is not pending approval (current status: " + expense.getApprovalStatus() + ")");
        }
        if (action != ExpenseApprovalStatus.APPROVED && action != ExpenseApprovalStatus.REJECTED) {
            throw new BusinessException(ErrorCodes.APPROVAL_STATUS_INVALID,
                    Map.of(),
                    "Action must be APPROVED or REJECTED");
        }

        String trimmedNotes = notes != null && !notes.isBlank() ? notes.trim() : null;
        expense.setApprovalStatus(action);
        expense.setApprovedByUserId(reviewer.getId());
        expense.setApprovedAt(businessClock.now());
        expense.setApprovalNotes(trimmedNotes);
        PumpExpense saved = expenseRepository.save(expense);

        boolean approved = action == ExpenseApprovalStatus.APPROVED;
        auditService.log(pumpId, approved ? AuditAction.EXPENSE_APPROVED : AuditAction.EXPENSE_REJECTED,
                "PumpExpense", expenseId.toString(),
                saved.getCategory() + " expense ₹" + saved.getAmount() + (approved ? " approved" : " rejected")
                        + (trimmedNotes != null ? ": " + trimmedNotes : ""),
                reviewer);
        log.info("Expense {}: expenseId={} pump={} amount={} by={}", action, expenseId, pumpId, saved.getAmount(), reviewer.getId());
        return saved;
    }
}
