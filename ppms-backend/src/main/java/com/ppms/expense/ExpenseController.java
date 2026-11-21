package com.ppms.expense;

import com.ppms.common.time.BusinessClock;
import com.ppms.common.dto.PageRequests;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class ExpenseController {

    private final PumpExpenseRepository  expenseRepository;
    private final ApprovalPolicy         approvalPolicy;
    private final AuditService           auditService;
    private final BusinessClock businessClock;

    /**
     * GET /api/pumps/{pumpId}/expenses?page=0&size=50&category=MAINTENANCE&approvalStatus=APPROVED
     * Returns paginated expenses for this pump, newest first.
     * category and approvalStatus are optional filters — omit to return all.
     * Accessible by OWNER, ADMIN, and ACCOUNTANT (read-only financial access).
     *
     * Note: nullable enum params cause PostgreSQL type inference errors in JPQL,
     * so filter dispatch is done in Java rather than a single nullable-param query.
     */
    @GetMapping("/{pumpId}/expenses")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public PagedResponse<PumpExpense> getExpenses(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) ExpenseApprovalStatus approvalStatus,
            @AuthenticationPrincipal User currentUser) {
        var pageReq = PageRequests.of(page, size);
        var result = (category != null && approvalStatus != null)
                ? expenseRepository.findByPumpIdAndCategoryAndApprovalStatusOrderByExpenseDateDescCreatedAtDesc(pumpId, category, approvalStatus, pageReq)
                : (category != null)
                ? expenseRepository.findByPumpIdAndCategoryOrderByExpenseDateDescCreatedAtDesc(pumpId, category, pageReq)
                : (approvalStatus != null)
                ? expenseRepository.findByPumpIdAndApprovalStatusOrderByExpenseDateDescCreatedAtDesc(pumpId, approvalStatus, pageReq)
                : expenseRepository.findByPumpIdOrderByExpenseDateDescCreatedAtDesc(pumpId, pageReq);
        return PagedResponse.of(result);
    }

    /**
     * GET /api/pumps/{pumpId}/expenses/summary
     * Approved total and pending-approval count/total across every expense of the pump (not one page).
     */
    @GetMapping("/{pumpId}/expenses/summary")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public ExpenseSummaryResponse getExpenseSummary(@PathVariable Long pumpId) {
        return new ExpenseSummaryResponse(
                expenseRepository.sumAmountByPumpIdAndApprovalStatus(pumpId, ExpenseApprovalStatus.APPROVED)
                        .setScale(2, RoundingMode.HALF_UP),
                expenseRepository.countByPumpIdAndApprovalStatus(pumpId, ExpenseApprovalStatus.PENDING_APPROVAL),
                expenseRepository.sumAmountByPumpIdAndApprovalStatus(pumpId, ExpenseApprovalStatus.PENDING_APPROVAL)
                        .setScale(2, RoundingMode.HALF_UP));
    }

    /**
     * POST /api/pumps/{pumpId}/expenses
     * Records a new expense entry.
     *
     * When saveDraft=true (request body flag): saves as DRAFT — approval workflow not triggered.
     * The user must call PATCH .../submit later to submit it for approval.
     *
     * When saveDraft=false (default):
     * - OWNER/ADMIN: always auto-APPROVED regardless of amount
     * - MANAGER/OPERATOR: auto-APPROVED if amount <= pump's expense_approval_threshold
     * - MANAGER/OPERATOR: PENDING_APPROVAL if amount > threshold (or threshold is not set)
     */
    @PostMapping("/{pumpId}/expenses")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    @ResponseStatus(HttpStatus.CREATED)
    public PumpExpense createExpense(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateExpenseRequest req,
            @AuthenticationPrincipal User currentUser) {
        BigDecimal amount = req.getAmount().setScale(2, RoundingMode.HALF_UP);

        ExpenseApprovalStatus approvalStatus;
        Long submittedByUserId = null;
        OffsetDateTime submittedAt = null;

        if (req.isSaveDraft()) {
            // Explicit DRAFT save — skip approval flow until submitted
            approvalStatus = ExpenseApprovalStatus.DRAFT;
        } else {
            // Immediate submission — auto-approve or queue for review
            approvalStatus = approvalPolicy.resolveExpenseStatus(pumpId, currentUser, amount);
            submittedByUserId = currentUser.getId();
            submittedAt = businessClock.now();
        }

        PumpExpense expense = PumpExpense.builder()
                .pumpId(pumpId)
                .category(req.getCategory())
                .amount(amount)
                .description(req.getDescription().trim())
                .expenseDate(req.getExpenseDate())
                .recordedByUserId(currentUser.getId())
                .approvalStatus(approvalStatus)
                .submittedByUserId(submittedByUserId)
                .submittedAt(submittedAt)
                .build();

        PumpExpense saved = expenseRepository.save(expense);

        auditService.log(pumpId, AuditAction.EXPENSE_RECORDED, "PumpExpense",
                saved.getId().toString(),
                req.getCategory() + " expense ₹" + saved.getAmount() + " recorded: " + req.getDescription() +
                " (status: " + approvalStatus + ")",
                currentUser);

        return saved;
    }

    /**
     * PATCH /api/pumps/{pumpId}/expenses/{expenseId}/submit
     * Submits a DRAFT expense for approval, transitioning it to PENDING_APPROVAL or APPROVED
     * based on the same auto-approval rules applied at creation time.
     * Only the person who created the expense or an OWNER/ADMIN can submit it.
     */
    @PatchMapping("/{pumpId}/expenses/{expenseId}/submit")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
    public PumpExpense submitExpense(
            @PathVariable Long pumpId,
            @PathVariable Long expenseId,
            @AuthenticationPrincipal User currentUser) {

        PumpExpense expense = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found"));

        if (!expense.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Expense not found");
        }

        if (expense.getApprovalStatus() != ExpenseApprovalStatus.DRAFT) {
            throw new BusinessException(
                    "Only DRAFT expenses can be submitted (current status: " + expense.getApprovalStatus() + ")");
        }

        // Only the creator or OWNER/ADMIN may submit a draft
        boolean isOwnerOrAdmin = currentUser.getRole() == UserRole.OWNER
                || currentUser.getRole() == UserRole.ADMIN
                || currentUser.getRole() == UserRole.SUPER_ADMIN;
        if (!isOwnerOrAdmin && !expense.getRecordedByUserId().equals(currentUser.getId())) {
            throw new BusinessException("Only the expense creator or an Owner/Admin can submit this draft.");
        }

        ExpenseApprovalStatus newStatus = approvalPolicy.resolveExpenseStatus(pumpId, currentUser, expense.getAmount());
        expense.setApprovalStatus(newStatus);
        expense.setSubmittedByUserId(currentUser.getId());
        expense.setSubmittedAt(businessClock.now());

        return expenseRepository.save(expense);
    }

    /**
     * PATCH /api/pumps/{pumpId}/expenses/{expenseId}/approve
     * Owner or Admin approves or rejects a PENDING_APPROVAL expense.
     * Body: { "action": "APPROVED" | "REJECTED", "notes": "optional reason" }
     */
    @PatchMapping("/{pumpId}/expenses/{expenseId}/approve")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public PumpExpense reviewExpense(
            @PathVariable Long pumpId,
            @PathVariable Long expenseId,
            @RequestBody ApproveExpenseRequest req,
            @AuthenticationPrincipal User currentUser) {

        PumpExpense expense = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found"));

        if (!expense.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Expense not found");
        }

        if (expense.getApprovalStatus() != ExpenseApprovalStatus.PENDING_APPROVAL) {
            throw new BusinessException(
                    "Expense is not pending approval (current status: " + expense.getApprovalStatus() + ")");
        }

        if (req.getAction() != ExpenseApprovalStatus.APPROVED && req.getAction() != ExpenseApprovalStatus.REJECTED) {
            throw new BusinessException("Action must be APPROVED or REJECTED");
        }

        expense.setApprovalStatus(req.getAction());
        expense.setApprovedByUserId(currentUser.getId());
        expense.setApprovedAt(businessClock.now());
        expense.setApprovalNotes(req.getNotes() != null ? req.getNotes().trim() : null);

        return expenseRepository.save(expense);
    }

    /**
     * DELETE /api/pumps/{pumpId}/expenses/{expenseId}
     * Removes an expense entry. Only OWNER can delete.
     */
    @DeleteMapping("/{pumpId}/expenses/{expenseId}")
    @PreAuthorize("hasRole('OWNER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExpense(
            @PathVariable Long pumpId,
            @PathVariable Long expenseId,
            @AuthenticationPrincipal User currentUser) {
        PumpExpense expense = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found"));
        if (!expense.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Expense not found");
        }
        if (expense.getApprovalStatus() != ExpenseApprovalStatus.DRAFT) {
            throw new BusinessException(
                    "Only DRAFT expenses can be deleted. Submitted or reviewed expenses are permanent records.");
        }
        expenseRepository.delete(expense);
    }

}
