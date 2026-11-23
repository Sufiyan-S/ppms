package com.ppms.approval;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.text.CodedText;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.credit.CreditPayment;
import com.ppms.credit.CreditPaymentApprovalService;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.expense.ExpenseApprovalService;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.expense.PumpExpense;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Expenses and credit payments waiting for an Owner or Admin, in one list. A bulk decision runs every item through
 * its own approval service, each in its own transaction, so one refused item does not undo the others.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalQueueService {

    private static final CodedText OWN_PAYMENT_REASON = CodedText.of(ServerTextCodes.APPROVAL_OWN_PAYMENT,
            "You recorded this payment, so another Owner or Admin must decide it.");
    private static final String UNEXPECTED_FAILURE_MESSAGE = "Could not be saved. Try this item again.";

    private final PumpExpenseRepository expenseRepository;
    private final CreditPaymentRepository paymentRepository;
    private final CreditClientRepository clientRepository;
    private final UserRepository userRepository;
    private final ExpenseApprovalService expenseApprovalService;
    private final CreditPaymentApprovalService paymentApprovalService;

    @Transactional(readOnly = true)
    public List<ApprovalItemResponse> pendingItems(Long pumpId, User currentUser) {
        List<PumpExpense> expenses = expenseRepository.findByPumpIdAndApprovalStatusOrderByCreatedAtAsc(
                pumpId, ExpenseApprovalStatus.PENDING_APPROVAL);
        List<CreditPayment> payments = paymentRepository.findPendingApprovalByPumpId(pumpId);

        Set<Long> userIds = new HashSet<>();
        expenses.forEach(expense -> userIds.add(submitterOf(expense)));
        payments.forEach(payment -> userIds.add(payment.getRecordedById()));
        Map<Long, String> userNameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
        Map<Long, String> clientNameById = clientRepository.findAllById(
                        payments.stream().map(CreditPayment::getClientId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        List<ApprovalItemResponse> items = new ArrayList<>();
        for (PumpExpense expense : expenses) {
            items.add(new ApprovalItemResponse(ApprovalKind.EXPENSE, expense.getId(), expense.getAmount(),
                    expense.getExpenseDate(), userNameById.get(submitterOf(expense)),
                    expense.getSubmittedAt() != null ? expense.getSubmittedAt() : expense.getCreatedAt(),
                    expense.getCategory().name(), null, null, expense.getDescription(), null, null, Map.of()));
        }
        for (CreditPayment payment : payments) {
            boolean ownPayment = payment.getRecordedById().equals(currentUser.getId());
            items.add(new ApprovalItemResponse(ApprovalKind.CREDIT_PAYMENT, payment.getId(), payment.getAmount(),
                    payment.getPaidAt(), userNameById.get(payment.getRecordedById()), payment.getCreatedAt(),
                    null, payment.getClientId(), clientNameById.get(payment.getClientId()), payment.getNotes(),
                    ownPayment ? OWN_PAYMENT_REASON.text() : null,
                    ownPayment ? OWN_PAYMENT_REASON.code() : null,
                    ownPayment ? OWN_PAYMENT_REASON.params() : Map.of()));
        }
        items.sort(Comparator.comparing(ApprovalItemResponse::submittedAt,
                Comparator.nullsLast(Comparator.<OffsetDateTime>naturalOrder())));
        return items;
    }

    public ApprovalDecisionResult decide(Long pumpId, ApprovalDecisionRequest request, User reviewer) {
        List<ApprovalDecisionResult.ItemResult> results = new ArrayList<>();
        for (ApprovalDecisionRequest.ApprovalItemKey item : request.items()) {
            results.add(decideOne(pumpId, item, request.action(), request.reason(), reviewer));
        }
        ApprovalDecisionResult result = ApprovalDecisionResult.of(results);
        log.info("Approval queue decision: pump={} action={} items={} succeeded={} failed={} by={}",
                pumpId, request.action(), results.size(), result.succeeded(), result.failed(), reviewer.getId());
        return result;
    }

    private ApprovalDecisionResult.ItemResult decideOne(Long pumpId, ApprovalDecisionRequest.ApprovalItemKey item,
                                                        ExpenseApprovalStatus action, String reason, User reviewer) {
        try {
            if (item.kind() == ApprovalKind.EXPENSE) {
                expenseApprovalService.review(pumpId, item.id(), action, reason, reviewer);
            } else {
                paymentApprovalService.review(pumpId, item.id(), action, reason, reviewer);
            }
            return new ApprovalDecisionResult.ItemResult(item.kind(), item.id(), true, null, null, null);
        } catch (BusinessException | ResourceNotFoundException e) {
            log.warn("Approval queue item refused: pump={} kind={} id={} action={}: {}",
                    pumpId, item.kind(), item.id(), action, e.getMessage());
            return new ApprovalDecisionResult.ItemResult(item.kind(), item.id(), false, e.getMessage(),
                    e.getCode(), e.getParams());
        } catch (RuntimeException e) {
            log.error("Approval queue item failed: pump={} kind={} id={} action={}",
                    pumpId, item.kind(), item.id(), action, e);
            return new ApprovalDecisionResult.ItemResult(item.kind(), item.id(), false, UNEXPECTED_FAILURE_MESSAGE,
                    ErrorCodes.APPROVAL_ITEM_NOT_SAVED, Map.of());
        }
    }

    private static Long submitterOf(PumpExpense expense) {
        return expense.getSubmittedByUserId() != null ? expense.getSubmittedByUserId() : expense.getRecordedByUserId();
    }
}
