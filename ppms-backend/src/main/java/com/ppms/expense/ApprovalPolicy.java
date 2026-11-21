package com.ppms.expense;

import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Decides whether an expense or credit payment needs Owner/Admin approval, using the pump's
 * expense_approval_threshold. With no threshold set, expenses wait for approval and credit
 * payments do not, matching how each worked before the rule was shared.
 */
@Component
@RequiredArgsConstructor
public class ApprovalPolicy {

    private final PumpLocationRepository pumpLocationRepository;

    public ExpenseApprovalStatus resolveExpenseStatus(Long pumpId, User submittedBy, BigDecimal amount) {
        return resolveStatus(pumpId, submittedBy, amount, ExpenseApprovalStatus.PENDING_APPROVAL);
    }

    public ExpenseApprovalStatus resolveCreditPaymentStatus(Long pumpId, User submittedBy, BigDecimal amount) {
        return resolveStatus(pumpId, submittedBy, amount, ExpenseApprovalStatus.APPROVED);
    }

    private ExpenseApprovalStatus resolveStatus(Long pumpId, User submittedBy, BigDecimal amount,
                                                ExpenseApprovalStatus statusWhenNoThreshold) {
        if (canApprove(submittedBy)) {
            return ExpenseApprovalStatus.APPROVED;
        }
        BigDecimal threshold = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("Pump not found: " + pumpId))
                .getExpenseApprovalThreshold();
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
