package com.ppms.credit;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Approves or rejects one pending credit payment and records the decision in the audit log, in one transaction. */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditPaymentApprovalService {

    private final CreditLedgerService ledgerService;
    private final AuditService auditService;

    @Transactional
    public CreditPayment review(Long pumpId, Long paymentId, ExpenseApprovalStatus newStatus, String reason, User reviewer) {
        CreditPayment saved = ledgerService.approvePayment(pumpId, paymentId, newStatus, reviewer);
        String trimmedReason = reason != null && !reason.isBlank() ? reason.trim() : null;

        log.info("Credit payment {}: paymentId={} pump={} amount={} by={}",
                newStatus, paymentId, pumpId, saved.getAmount(), reviewer.getId());
        auditService.log(pumpId, AuditAction.CREDIT_PAYMENT_RECEIVED,
                "CreditPayment", paymentId.toString(),
                "Payment " + newStatus + ": ₹" + saved.getAmount() + " for clientId=" + saved.getClientId()
                        + (trimmedReason != null ? ", reason=" + trimmedReason : ""),
                reviewer);
        return saved;
    }
}
