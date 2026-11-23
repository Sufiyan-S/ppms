package com.ppms.expense;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Decides whether an expense or credit payment needs Owner/Admin approval, using the pump's
 * expense_approval_threshold. With no threshold set, expenses wait for approval and credit
 * payments do not, matching how each worked before the rule was shared.
 */
@Component
@RequiredArgsConstructor
public class ApprovalPolicy {

    private final PumpLocationRepository pumpLocationRepository;
    private final PumpExpenseRepository expenseRepository;

    /**
     * An expense is judged together with the pump's other submitted expenses of the same category and day,
     * so splitting one bill into parts below the threshold still needs approval. The pump row is locked until
     * the caller's transaction ends, so two submissions at the same moment cannot both count the other one out.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public ExpenseApprovalStatus resolveExpenseStatus(Long pumpId, User submittedBy, BigDecimal amount,
                                                      ExpenseCategory category, LocalDate expenseDate) {
        if (canApprove(submittedBy)) {
            return ExpenseApprovalStatus.APPROVED;
        }
        PumpLocation pump = pumpLocationRepository.findByIdForUpdate(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found: " + pumpId));
        BigDecimal sameDayTotal = expenseRepository.sumSubmittedAmountByPumpIdAndCategoryAndExpenseDate(
                pumpId, category, expenseDate).add(amount);
        return statusForAmount(sameDayTotal, pump.getExpenseApprovalThreshold(), ExpenseApprovalStatus.PENDING_APPROVAL);
    }

    public ExpenseApprovalStatus resolveCreditPaymentStatus(Long pumpId, User submittedBy, BigDecimal amount) {
        if (canApprove(submittedBy)) {
            return ExpenseApprovalStatus.APPROVED;
        }
        BigDecimal threshold = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found: " + pumpId))
                .getExpenseApprovalThreshold();
        return statusForAmount(amount, threshold, ExpenseApprovalStatus.APPROVED);
    }

    private static ExpenseApprovalStatus statusForAmount(BigDecimal amount, BigDecimal threshold,
                                                         ExpenseApprovalStatus statusWhenNoThreshold) {
        if (threshold == null || threshold.signum() <= 0) {
            return statusWhenNoThreshold;
        }
        return amount.compareTo(threshold) <= 0
                ? ExpenseApprovalStatus.APPROVED
                : ExpenseApprovalStatus.PENDING_APPROVAL;
    }

    private static boolean canApprove(User user) {
        return user.getRole() == UserRole.OWNER
                || user.getRole() == UserRole.ADMIN
                || user.getRole() == UserRole.SUPER_ADMIN;
    }
}
