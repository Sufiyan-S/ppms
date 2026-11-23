package com.ppms.credit;

import java.util.Map;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.expense.ApprovalPolicy;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.invoice.InvoicedSaleGuard;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.UserRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Service layer for credit ledger business operations.
 *
 * @Transactional lives here — not on the controller — so DB transactions are scoped
 * to service methods only, not to the full HTTP request lifecycle.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditLedgerService {

    private final CreditClientRepository clientRepository;
    private final CreditPaymentRepository paymentRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final ShiftRepository shiftRepository;
    private final CreditEntryReassignmentRepository reassignmentRepository;
    private final InvoicedSaleGuard invoicedSaleGuard;
    private final CreditInterestService interestService;
    private final ApprovalPolicy approvalPolicy;
    private final CreditAccountPolicyService creditAccountPolicyService;
    private final UserRepository userRepository;
    private final BusinessClock businessClock;

    /**
     * Records a payment settlement against a client's outstanding balance.
     * A payment can never exceed what the whole client group still owes.
     */
    @Transactional
    public CreditPayment recordPayment(Long pumpId, Long clientId,
                                       RecordPaymentRequest request, User currentUser) {

        CreditClient client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT, "Credit client not found"));

        if (!client.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.CREDIT_CLIENT, "Client not found");
        }

        creditAccountPolicyService.lockLimitHolder(client);

        BigDecimal payable = payableAmount(client);
        BigDecimal paymentAmount = request.getAmount().setScale(2, RoundingMode.HALF_UP);
        if (paymentAmount.compareTo(payable) > 0) {
            throw new BusinessException(ErrorCodes.CREDIT_PAYMENT_EXCEEDS_PAYABLE,
                    Map.of("amount", paymentAmount.toPlainString(), "payable", payable.toPlainString()),
                    "Payment amount (" + paymentAmount + ") exceeds the amount still payable (" + payable + "), "
                            + "which is the outstanding balance less payments awaiting approval. "
                            + "You cannot over-pay a credit account.");
        }

        ExpenseApprovalStatus approvalStatus = approvalPolicy.resolveCreditPaymentStatus(pumpId, currentUser, paymentAmount);
        if (approvalStatus == ExpenseApprovalStatus.PENDING_APPROVAL) {
            log.info("Credit payment set to PENDING_APPROVAL: pumpId={} amount={}", pumpId, paymentAmount);
        }

        CreditPayment payment = CreditPayment.builder()
                .pumpId(pumpId)
                .clientId(clientId)
                .amount(paymentAmount)
                .paymentMode(request.getPaymentMode())
                .referenceNo(request.getReferenceNo())
                .notes(request.getNotes())
                .paidAt(request.getPaidAt())
                .recordedById(currentUser.getId())
                .paymentApprovalStatus(approvalStatus)
                .build();

        payment = paymentRepository.save(payment);
        if (approvalStatus == ExpenseApprovalStatus.APPROVED) {
            interestService.recalculateChargedInterestFrom(clientId, payment.getPaidAt(),
                    "Recalculated after payment dated " + payment.getPaidAt(), currentUser);
        }

        log.info("Credit payment recorded: pump={}, client={}, amount={}, mode={}, status={}, by={}",
                pumpId, clientId, payment.getAmount(), payment.getPaymentMode(),
                payment.getPaymentApprovalStatus(), currentUser.getId());

        return payment;
    }

    public CreditClient saveClient(CreditClient client) {
        return clientRepository.save(client);
    }

    /**
     * Waives an interest charge: the row stays on the ledger with who waived it and why, but no longer
     * counts as owed. Waiving the latest charge lets its period be charged again by the next interest run.
     */
    @Transactional
    public CreditInterestCharge waiveInterestCharge(Long pumpId, Long clientId, Long chargeId,
                                                    String reason, User currentUser) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessException(ErrorCodes.INTEREST_WAIVER_REASON_REQUIRED,
                    Map.of(),
                    "A reason is required to waive an interest charge.");
        }

        CreditInterestCharge charge = interestChargeRepository.findById(chargeId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.INTEREST_CHARGE,
                        "Interest charge not found"));

        if (!charge.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.INTEREST_CHARGE, "Interest charge not found");
        }

        if (!charge.getClientId().equals(clientId)) {
            throw new BusinessException(ErrorCodes.INTEREST_CHARGE_OTHER_CLIENT,
                    Map.of(),
                    "Interest charge does not belong to this client");
        }

        creditAccountPolicyService.lockLimitHolderOfClient(clientId);

        if (charge.getVoidedAt() != null) {
            throw new BusinessException(ErrorCodes.INTEREST_CHARGE_ALREADY_WAIVED,
                    Map.of(),
                    "This interest charge has already been waived.");
        }

        charge.setVoidedAt(businessClock.now());
        charge.setVoidedBy(currentUser.getId());
        charge.setVoidReason(reason.trim());
        charge = interestChargeRepository.save(charge);

        log.info("Interest charge waived: pump={}, client={}, chargeId={}, amount={}, period={}/{}, waivedBy={}",
                pumpId, clientId, chargeId, charge.getAmount(),
                charge.getPeriodFrom(), charge.getPeriodTo(), currentUser.getId());
        return charge;
    }

    /**
     * Moves a credit entry from its current account to a different account within the same group.
     */
    @Transactional
    public void reassignCreditEntry(Long pumpId, Long entryId,
                                    ReassignCreditEntryRequest request, User currentUser) {

        ShiftCreditEntry entry = creditEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_ENTRY, "Credit entry not found"));

        Shift shift = shiftRepository.findById(entry.getShiftId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT, "Shift not found"));
        if (!shift.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.CREDIT_ENTRY, "Credit entry not found");
        }
        invoicedSaleGuard.requireFuelEntriesNotInvoiced(List.of(entryId));

        CreditClient toClient = clientRepository.findById(request.getToClientId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Target credit client not found"));
        if (!toClient.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.CREDIT_CLIENT, "Target client not found");
        }

        if (entry.getClientId() != null && entry.getClientId().equals(request.getToClientId())) {
            throw new BusinessException(ErrorCodes.CREDIT_ENTRY_ALREADY_ON_ACCOUNT,
                    Map.of(),
                    "Entry is already assigned to this account");
        }

        Long fromClientId = entry.getClientId(); // null when entry was never linked to a client
        validateGroupMove(pumpId, fromClientId, request.getToClientId());
        if (fromClientId == null && "ACTIVE".equals(entry.getVoidStatus())) {
            // Linking an old free-text entry adds debt to the client, so it must pass the same checks as a new sale.
            creditAccountPolicyService.validateCreditSaleAllowed(pumpId, toClient, entry.getAmount());
        } else {
            creditAccountPolicyService.lockLimitHolder(toClient);
        }

        // A first assignment has no previous client, and from_client_id cannot be null, so only moves are recorded.
        if (fromClientId != null) {
            reassignmentRepository.save(CreditEntryReassignment.builder()
                    .creditEntryId(entryId)
                    .fromClientId(fromClientId)
                    .toClientId(request.getToClientId())
                    .reassignedByUserId(currentUser.getId())
                    .reason(request.getReason().trim())
                    .build());
        } else {
            log.warn("Credit entry {} had no prior client (initial assignment to client={}), " +
                    "skipping audit record to avoid misleading from==to entry", entryId, request.getToClientId());
        }

        entry.setClientId(request.getToClientId());
        creditEntryRepository.save(entry);

        log.info("Credit entry {} moved: pump={}, fromClient={}, toClient={}, by={}",
                entryId, pumpId, fromClientId != null ? fromClientId : "unlinked",
                request.getToClientId(), currentUser.getId());
    }

    @Transactional
    public void reassignCreditPayment(Long pumpId, Long paymentId,
                                      ReassignCreditEntryRequest request, User currentUser) {

        CreditPayment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_PAYMENT,
                        "Credit payment not found"));

        if (!payment.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.CREDIT_PAYMENT, "Credit payment not found");
        }

        if (payment.getClientId().equals(request.getToClientId())) {
            throw new BusinessException(ErrorCodes.CREDIT_PAYMENT_ALREADY_ON_ACCOUNT,
                    Map.of(),
                    "Payment is already assigned to this account");
        }

        validateGroupMove(pumpId, payment.getClientId(), request.getToClientId());
        CreditClient toClient = clientRepository.findById(request.getToClientId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Target credit client not found"));
        creditAccountPolicyService.lockLimitHolder(toClient);

        Long fromClientId = payment.getClientId();
        payment.setClientId(request.getToClientId());
        paymentRepository.save(payment);

        log.info("Credit payment {} moved: pump={}, fromClient={}, toClient={}, by={}",
                paymentId, pumpId, fromClientId, request.getToClientId(), currentUser.getId());
    }

    @Transactional
    public CreditPayment approvePayment(Long pumpId, Long paymentId,
                                        ExpenseApprovalStatus newStatus, User currentUser) {
        Long clientId = paymentRepository.findClientIdByIdAndPumpId(paymentId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PAYMENT, "Payment not found"));
        CreditClient client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT, "Credit client not found"));
        creditAccountPolicyService.lockLimitHolder(client);

        CreditPayment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PAYMENT, "Payment not found"));

        if (payment.getPaymentApprovalStatus() != ExpenseApprovalStatus.PENDING_APPROVAL) {
            throw new BusinessException(ErrorCodes.CREDIT_PAYMENT_NOT_PENDING,
                    Map.of("statusCode", payment.getPaymentApprovalStatus().name()),
                    "Payment is already " + payment.getPaymentApprovalStatus() + " — only PENDING_APPROVAL payments can be acted on");
        }
        if (payment.getRecordedById().equals(currentUser.getId())) {
            throw new BusinessException(ErrorCodes.CREDIT_PAYMENT_SELF_APPROVAL,
                    Map.of(),
                    "You recorded this payment, so another Owner or Admin must approve or reject it.");
        }

        if (newStatus == ExpenseApprovalStatus.APPROVED) {
            BigDecimal payableIncludingThisPayment = payableAmount(client).add(payment.getAmount());
            if (payment.getAmount().compareTo(payableIncludingThisPayment) > 0) {
                throw new BusinessException(ErrorCodes.CREDIT_PAYMENT_APPROVAL_EXCEEDS_PAYABLE,
                        Map.of("amount", payment.getAmount().toPlainString(),
                               "payable", payableIncludingThisPayment.toPlainString()),
                        "Approving this payment (" + payment.getAmount() + ") would exceed the amount still payable ("
                                + payableIncludingThisPayment + "). Reject it or record a smaller payment.");
            }
        }

        payment.setPaymentApprovalStatus(newStatus);
        payment.setApprovedByUserId(currentUser.getId());
        payment.setApprovedAt(businessClock.now());
        payment = paymentRepository.save(payment);
        if (newStatus == ExpenseApprovalStatus.APPROVED) {
            interestService.recalculateChargedInterestFrom(payment.getClientId(), payment.getPaidAt(),
                    "Recalculated after approving payment dated " + payment.getPaidAt(), currentUser);
        }
        return payment;
    }

    /**
     * Outstanding less payments awaiting approval, for the whole parent / sub-account group.
     * A sub-account payment is also capped at that sub-account's own payable balance.
     */
    private BigDecimal payableAmount(CreditClient client) {
        Long holderId = creditAccountPolicyService.limitHolderId(client);
        List<Long> groupClientIds = new ArrayList<>();
        groupClientIds.add(holderId);
        clientRepository.findByParentClientId(holderId).forEach(child -> groupClientIds.add(child.getId()));

        BigDecimal groupPayable = interestService.computeOutstandingWithChildren(holderId)
                .subtract(paymentRepository.sumPendingAmountByClientIds(groupClientIds));
        if (client.getId().equals(holderId)) {
            return groupPayable.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal ownPayable = interestService.computeOutstanding(client.getId())
                .subtract(paymentRepository.sumPendingAmountByClientIds(List.of(client.getId())));
        return groupPayable.min(ownPayable).setScale(2, RoundingMode.HALF_UP);
    }

    public String resolveRecordedByName(Long userId) {
        return userRepository.findById(userId)
                .map(User::getFullName)
                .orElse("Unknown");
    }

    private void validateGroupMove(Long pumpId, Long fromClientId, Long toClientId) {
        if (fromClientId == null) {
            return;
        }

        CreditClient fromClient = clientRepository.findById(fromClientId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Source credit client not found"));
        CreditClient toClient = clientRepository.findById(toClientId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Target credit client not found"));

        if (!fromClient.getPumpId().equals(pumpId) || !toClient.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.CREDIT_CLIENT, "Credit client not found");
        }

        Long fromGroupRoot = fromClient.getParentClientId() != null ? fromClient.getParentClientId() : fromClient.getId();
        Long toGroupRoot = toClient.getParentClientId() != null ? toClient.getParentClientId() : toClient.getId();

        if (!fromGroupRoot.equals(toGroupRoot)) {
            throw new BusinessException(ErrorCodes.CREDIT_MOVE_OUTSIDE_GROUP,
                    Map.of(),
                    "Transactions can only be moved within the same parent / sub-account group");
        }
    }
}
