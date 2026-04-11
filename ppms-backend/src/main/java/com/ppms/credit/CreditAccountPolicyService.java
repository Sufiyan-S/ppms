package com.ppms.credit;

import com.ppms.common.exception.BusinessException;
import com.ppms.shift.ShiftCreditEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CreditAccountPolicyService {

    private final CreditClientRepository creditClientRepository;
    private final CreditInterestService creditInterestService;
    private final CreditExtensionRepository creditExtensionRepository;
    private final CreditPaymentRepository creditPaymentRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;

    public CreditClient resolveClientForPump(Long pumpId, Long clientId, String clientName) {
        if (clientId != null) {
            return creditClientRepository.findById(clientId)
                    .filter(client -> client.getPumpId().equals(pumpId))
                    .orElse(null);
        }
        if (clientName == null || clientName.isBlank()) {
            return null;
        }
        return creditClientRepository.findByPumpIdAndName(pumpId, clientName.trim()).orElse(null);
    }

    public void validateCreditLimit(Long pumpId, CreditClient client, BigDecimal amount) {
        if (client == null) {
            return;
        }

        CreditClient limitHolder = getLimitHolder(client);
        if (limitHolder.getCreditLimit().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        BigDecimal combinedOutstanding = creditInterestService.computeOutstandingWithChildren(limitHolder.getId());
        BigDecimal projectedOutstanding = combinedOutstanding.add(amount).setScale(2, RoundingMode.HALF_UP);
        if (projectedOutstanding.compareTo(limitHolder.getCreditLimit()) > 0) {
            throw new BusinessException(
                    "Credit limit exceeded for '" + limitHolder.getName() + "'. " +
                            "Current outstanding (group): " + combinedOutstanding.setScale(2, RoundingMode.HALF_UP) +
                            ", this entry: " + amount +
                            ", limit: " + limitHolder.getCreditLimit() + ". " +
                            "Please record a payment before adding more credit.");
        }
    }

    /**
     * Applies the stricter mid-shift sale rules. Close-shift entry capture only validates the limit,
     * while real-time credit sales must also respect approved extensions and overdue billing-cycle rules.
     *
     * Acquires a PESSIMISTIC WRITE lock on the limit-holder row before reading the outstanding
     * balance. This serialises concurrent credit sales for the same client so two operators at
     * the same pump cannot simultaneously bypass the limit check (race condition fix).
     * The lock is held for the duration of the caller's @Transactional boundary (ShiftService.addCreditEntry).
     */
    public void validateCreditSaleAllowed(Long pumpId, CreditClient client, BigDecimal amount) {
        if (client == null) {
            return;
        }

        CreditClient limitHolder = getLimitHolderWithLock(client);
        creditExtensionRepository.expireOverdueExtensions(LocalDate.now());
        List<CreditExtension> activeExtensions = creditExtensionRepository
                .findByPumpIdAndClientIdAndStatus(pumpId, limitHolder.getId(), CreditExtensionStatus.ACTIVE);

        if (limitHolder.getCreditLimit().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal combinedOutstanding = creditInterestService.computeOutstandingWithChildren(limitHolder.getId());
            BigDecimal projected = combinedOutstanding.add(amount).setScale(2, RoundingMode.HALF_UP);
            BigDecimal extensionHeadroom = activeExtensions.stream()
                    .filter(extension -> extension.getExtensionType() == CreditExtensionType.AMOUNT_EXTENSION
                            && extension.getExtensionAmount() != null)
                    .map(CreditExtension::getExtensionAmount)
                    .findFirst()
                    .orElse(BigDecimal.ZERO);
            BigDecimal effectiveLimit = limitHolder.getCreditLimit().add(extensionHeadroom);

            if (projected.compareTo(effectiveLimit) > 0) {
                throw new BusinessException(
                        "Credit limit exceeded for '" + limitHolder.getName() + "'. " +
                                "Outstanding (group): " + combinedOutstanding.setScale(2, RoundingMode.HALF_UP) +
                                ", this entry: " + amount +
                                ", effective limit: " + effectiveLimit.setScale(2, RoundingMode.HALF_UP) + ".");
            }
        }

        boolean hasCycleWaiver = activeExtensions.stream().anyMatch(extension ->
                extension.getExtensionType() == CreditExtensionType.BILLING_CYCLE_EXTENSION
                        || extension.getExtensionType() == CreditExtensionType.OVERDUE_BLOCK_WAIVER);
        if (!hasCycleWaiver && isBillingCycleOverdue(limitHolder)) {
            throw new BusinessException(
                    "Credit sales blocked for '" + limitHolder.getName() + "': billing cycle overdue. " +
                            "The client must settle their outstanding balance or an Admin/Owner must grant a Credit Extension.");
        }
    }

    private CreditClient getLimitHolder(CreditClient client) {
        if (client.getParentClientId() == null) {
            return client;
        }
        return creditClientRepository.findById(client.getParentClientId()).orElse(client);
    }

    /**
     * Like getLimitHolder but acquires a PESSIMISTIC WRITE (SELECT FOR UPDATE) lock on the
     * limit-holder row. Used only in the real-time credit sale path to prevent concurrent
     * operators from simultaneously passing the same credit limit check and together
     * exceeding the limit.
     */
    private CreditClient getLimitHolderWithLock(CreditClient client) {
        Long holderId = client.getParentClientId() != null ? client.getParentClientId() : client.getId();
        return creditClientRepository.findByIdForUpdate(holderId).orElse(client);
    }

    private boolean isBillingCycleOverdue(CreditClient client) {
        BigDecimal outstanding = creditInterestService.computeOutstanding(client.getId());
        if (outstanding.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }

        int cycleDays = client.getBillingCycle() == BillingCycle.WEEKLY ? 7 : 30;
        LocalDate overdueThreshold = LocalDate.now().minusDays(cycleDays);

        Optional<LocalDate> lastPayment = creditPaymentRepository.findLastPaymentDateByClientId(client.getId());
        if (lastPayment.isPresent()) {
            return lastPayment.get().isBefore(overdueThreshold);
        }

        return creditEntryRepository.findOldestEntryDateByClientId(client.getId())
                .map(dateTime -> dateTime.atZoneSameInstant(ZoneOffset.UTC).toLocalDate().isBefore(overdueThreshold))
                .orElse(false);
    }
}
