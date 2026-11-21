package com.ppms.expense;

import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ApprovalPolicyTest {

    private final PumpLocationRepository pumpLocationRepository = mock(PumpLocationRepository.class);
    private final ApprovalPolicy approvalPolicy = new ApprovalPolicy(pumpLocationRepository);

    @Test
    void expenseWithNoThresholdWaitsForApproval() {
        givenThreshold(null);
        assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("50000")))
                .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
    }

    @Test
    void creditPaymentWithNoThresholdIsApproved() {
        givenThreshold(null);
        assertThat(approvalPolicy.resolveCreditPaymentStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("50000")))
                .isEqualTo(ExpenseApprovalStatus.APPROVED);
    }

    @Test
    void zeroThresholdCountsAsNoThreshold() {
        givenThreshold(BigDecimal.ZERO);
        assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("10")))
                .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
        assertThat(approvalPolicy.resolveCreditPaymentStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("10")))
                .isEqualTo(ExpenseApprovalStatus.APPROVED);
    }

    @Test
    void amountAboveThresholdNeedsApprovalForManager() {
        givenThreshold(new BigDecimal("1000"));
        assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("1000.01")))
                .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
        assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("1000")))
                .isEqualTo(ExpenseApprovalStatus.APPROVED);
        assertThat(approvalPolicy.resolveCreditPaymentStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("1000.01")))
                .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
    }

    @Test
    void ownerIsNeverHeldForApproval() {
        givenThreshold(null);
        assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(UserRole.OWNER), new BigDecimal("99999")))
                .isEqualTo(ExpenseApprovalStatus.APPROVED);
    }

    @Test
    void adminAndSuperAdminAreNeverHeldForApprovalEvenAboveTheThreshold() {
        givenThreshold(new BigDecimal("1000"));
        for (UserRole role : new UserRole[]{UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OWNER}) {
            assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(role), new BigDecimal("50000")))
                    .as("expense by %s", role)
                    .isEqualTo(ExpenseApprovalStatus.APPROVED);
            assertThat(approvalPolicy.resolveCreditPaymentStatus(1L, userWithRole(role), new BigDecimal("50000")))
                    .as("credit payment by %s", role)
                    .isEqualTo(ExpenseApprovalStatus.APPROVED);
        }
    }

    @Test
    void operatorAndAccountantAreHeldAboveTheThresholdLikeAManager() {
        givenThreshold(new BigDecimal("1000"));
        for (UserRole role : new UserRole[]{UserRole.OPERATOR, UserRole.ACCOUNTANT}) {
            assertThat(approvalPolicy.resolveExpenseStatus(1L, userWithRole(role), new BigDecimal("1000.01")))
                    .as("expense by %s", role)
                    .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
        }
    }

    @Test
    void creditPaymentEqualToTheThresholdIsApproved() {
        givenThreshold(new BigDecimal("1000"));
        assertThat(approvalPolicy.resolveCreditPaymentStatus(1L, userWithRole(UserRole.MANAGER), new BigDecimal("1000.00")))
                .isEqualTo(ExpenseApprovalStatus.APPROVED);
    }

    private void givenThreshold(BigDecimal threshold) {
        PumpLocation pump = PumpLocation.builder().id(1L).expenseApprovalThreshold(threshold).build();
        when(pumpLocationRepository.findById(1L)).thenReturn(Optional.of(pump));
    }

    private static User userWithRole(UserRole role) {
        return User.builder().id(7L).role(role).build();
    }
}
