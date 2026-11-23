package com.ppms.credit;

import com.ppms.common.time.BusinessClock;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CreditAccountPolicyService {

    private final CreditClientRepository creditClientRepository;
    private final CreditInterestService creditInterestService;
    private final CreditExtensionRepository creditExtensionRepository;
    private final CreditPaymentRepository creditPaymentRepository;
    private final BusinessClock businessClock;
    private final EntityManager entityManager;

    /**
     * Finds the client a credit entry is for, by id or else by exact name. Every credit entry must
     * belong to an existing client of the pump, so an unknown client is refused.
     */
    public CreditClient requireClientForCreditEntry(Long pumpId, Long clientId, String clientName) {
        if (clientId != null) {
            return creditClientRepository.findById(clientId)
                    .filter(client -> client.getPumpId().equals(pumpId))
                    .orElseThrow(() -> new BusinessException(ErrorCodes.CREDIT_CLIENT_NOT_AT_PUMP,
                            Map.of("clientId", clientId),
                            "Credit client #" + clientId + " does not exist at this pump. Pick a client from the list."));
        }
        if (clientName == null || clientName.isBlank()) {
            throw new BusinessException(ErrorCodes.CREDIT_CLIENT_REQUIRED_FOR_ENTRY,
                    Map.of(),
                    "Pick a credit client for every credit entry.");
        }
        return creditClientRepository.findByPumpIdAndName(pumpId, clientName.trim())
                .orElseThrow(() -> new BusinessException(ErrorCodes.CREDIT_CLIENT_NAME_NOT_AT_PUMP,
                        Map.of("clientName", clientName.trim()),
                        "No credit client named '" + clientName.trim() + "' exists at this pump. "
                                + "Add the client on the Credit page first, then pick it from the list."));
    }

    /** Refuses credit to a disabled client, and to a sub-account whose parent account is disabled. */
    public void requireClientAcceptsCredit(CreditClient client) {
        if (!client.isActive()) {
            throw new BusinessException(ErrorCodes.CREDIT_CLIENT_DISABLED, Map.of("clientName", client.getName()),
                    "Credit is disabled for '" + client.getName()
                    + "'. Enable the client on the Credit page before giving it credit.");
        }
        if (client.getParentClientId() == null) {
            return;
        }
        CreditClient parent = creditClientRepository.findById(client.getParentClientId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Credit client not found: " + client.getParentClientId()));
        if (!parent.isActive()) {
            throw new BusinessException(ErrorCodes.CREDIT_PARENT_ACCOUNT_DISABLED,
                    Map.of("clientName", client.getName(), "parentName", parent.getName()),
                    "Credit is disabled for '" + client.getName() + "' because its parent account '"
                    + parent.getName() + "' is disabled.");
        }
    }

    /**
     * Checks credit entries captured at shift close against each group's limit. Group rows are
     * locked first, and entries for the same group are added together before each check.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void validateCreditLimits(Map<CreditClient, BigDecimal> amountByClient) {
        amountByClient.keySet().forEach(this::requireClientAcceptsCredit);
        Map<Long, BigDecimal> amountByHolderId = new HashMap<>();
        amountByClient.forEach((client, amount) ->
                amountByHolderId.merge(limitHolderId(client), amount, BigDecimal::add));

        lockLimitHolders(amountByHolderId.keySet());

        for (Map.Entry<Long, BigDecimal> holderAmount : amountByHolderId.entrySet()) {
            CreditClient limitHolder = creditClientRepository.findById(holderAmount.getKey())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                            "Credit client not found: " + holderAmount.getKey()));
            if (limitHolder.getCreditLimit().compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            BigDecimal amount = holderAmount.getValue();
            BigDecimal combinedOutstanding = creditInterestService.computeOutstandingWithChildren(limitHolder.getId());
            BigDecimal projectedOutstanding = combinedOutstanding.add(amount).setScale(2, RoundingMode.HALF_UP);
            if (projectedOutstanding.compareTo(limitHolder.getCreditLimit()) > 0) {
                throw new BusinessException(ErrorCodes.CREDIT_LIMIT_EXCEEDED,
                        Map.of("clientName", limitHolder.getName(),
                                "outstanding", combinedOutstanding.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "amount", amount.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "limit", limitHolder.getCreditLimit().setScale(2, RoundingMode.HALF_UP).toPlainString()),
                        "Credit limit exceeded for '" + limitHolder.getName() + "'. " +
                                "Current outstanding (group): " + combinedOutstanding.setScale(2, RoundingMode.HALF_UP) +
                                ", entries in this shift: " + amount.setScale(2, RoundingMode.HALF_UP) +
                                ", limit: " + limitHolder.getCreditLimit() + ". " +
                                "Please record a payment before adding more credit.");
            }
        }
    }

    public Long limitHolderId(CreditClient client) {
        return client.getParentClientId() != null ? client.getParentClientId() : client.getId();
    }

    /**
     * Locks the group's limit-holder row and reloads it, so a copy already held in this
     * transaction cannot hide a concurrent limit change.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public CreditClient lockLimitHolder(CreditClient client) {
        Long holderId = limitHolderId(client);
        CreditClient holder = creditClientRepository.findByIdForUpdate(holderId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Credit client not found: " + holderId));
        entityManager.refresh(holder);
        return holder;
    }

    /** Locks the limit holders of several clients, in holder id order. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockLimitHoldersOfClients(Collection<Long> clientIds) {
        List<Long> holderIds = creditClientRepository.findAllById(clientIds).stream()
                .map(this::limitHolderId)
                .toList();
        lockLimitHolders(holderIds);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockLimitHolderOfClient(Long clientId) {
        CreditClient client = creditClientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Credit client not found: " + clientId));
        lockLimitHolder(client);
    }

    /** Locks limit-holder rows in ascending id order so concurrent callers cannot deadlock. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockLimitHolders(Collection<Long> holderIds) {
        for (Long holderId : new TreeSet<>(holderIds)) {
            CreditClient holder = creditClientRepository.findByIdForUpdate(holderId)
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                            "Credit client not found: " + holderId));
            entityManager.refresh(holder);
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
    @Transactional(propagation = Propagation.MANDATORY)
    public void validateCreditSaleAllowed(Long pumpId, CreditClient client, BigDecimal amount) {
        requireClientAcceptsCredit(client);
        CreditClient limitHolder = lockLimitHolder(client);
        List<CreditExtension> activeExtensions = creditExtensionRepository
                .findInEffect(pumpId, limitHolder.getId(), businessClock.today());

        if (limitHolder.getCreditLimit().compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal combinedOutstanding = creditInterestService.computeOutstandingWithChildren(limitHolder.getId());
            BigDecimal projected = combinedOutstanding.add(amount).setScale(2, RoundingMode.HALF_UP);
            BigDecimal effectiveLimit = effectiveLimit(limitHolder, activeExtensions);

            if (projected.compareTo(effectiveLimit) > 0) {
                throw new BusinessException(ErrorCodes.CREDIT_LIMIT_EXCEEDED,
                        Map.of("clientName", limitHolder.getName(),
                                "outstanding", combinedOutstanding.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "amount", amount.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                                "limit", effectiveLimit.setScale(2, RoundingMode.HALF_UP).toPlainString()),
                        "Credit limit exceeded for '" + limitHolder.getName() + "'. " +
                                "Outstanding (group): " + combinedOutstanding.setScale(2, RoundingMode.HALF_UP) +
                                ", this entry: " + amount +
                                ", effective limit: " + effectiveLimit.setScale(2, RoundingMode.HALF_UP) + ".");
            }
        }

        if (!hasCycleWaiver(activeExtensions) && isBillingCycleOverdue(limitHolder)) {
            throw new BusinessException(ErrorCodes.CREDIT_BILLING_CYCLE_OVERDUE,
                    Map.of("clientName", limitHolder.getName()),
                    "Credit sales blocked for '" + limitHolder.getName() + "': billing cycle overdue. " +
                            "The client must settle their outstanding balance or an Admin/Owner must grant a Credit Extension.");
        }
    }

    /**
     * The whole group counts: sub-account sales make the group owe, and a payment on any account of
     * the group keeps it current.
     */
    private boolean isBillingCycleOverdue(CreditClient limitHolder) {
        BigDecimal groupOutstanding = creditInterestService.computeOutstandingWithChildren(limitHolder.getId());
        if (groupOutstanding.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }

        List<Long> groupClientIds = new ArrayList<>();
        groupClientIds.add(limitHolder.getId());
        creditClientRepository.findByParentClientId(limitHolder.getId())
                .forEach(child -> groupClientIds.add(child.getId()));

        return isBillingCycleOverdue(limitHolder.getBillingCycle(), groupOutstanding,
                creditPaymentRepository.findLastPaymentDateByClientIds(groupClientIds).orElse(null),
                creditInterestService.findOldestCreditSaleDate(groupClientIds).orElse(null));
    }

    /**
     * Whether each client of the pump could take a credit sale now, by the rules of validateCreditSaleAllowed:
     * a disabled client or parent first, then the group limit with any amount extension, then the overdue
     * billing cycle unless an extension waives it. Loads the whole pump in a fixed number of queries.
     */
    @Transactional(readOnly = true)
    public Map<Long, CreditClientStandingResponse> creditStandingOfPumpClients(Long pumpId) {
        List<CreditClient> clients = creditClientRepository.findByPumpIdOrderByNameAsc(pumpId);
        if (clients.isEmpty()) {
            return Map.of();
        }
        List<Long> clientIds = clients.stream().map(CreditClient::getId).toList();
        Map<Long, CreditClient> clientById = clients.stream()
                .collect(Collectors.toMap(CreditClient::getId, Function.identity()));
        Map<Long, List<Long>> groupIdsByHolderId = clients.stream()
                .collect(Collectors.groupingBy(this::limitHolderId,
                        Collectors.mapping(CreditClient::getId, Collectors.toList())));

        Map<Long, BigDecimal> outstandingById = creditInterestService.computeOutstandingBatch(clientIds);
        Map<Long, LocalDate> lastPaymentById = toDateMap(creditPaymentRepository.findLastPaymentDatesByClientIds(clientIds));
        Map<Long, LocalDate> oldestSaleById = creditInterestService.findOldestCreditSaleDates(clientIds);
        Map<Long, List<CreditExtension>> extensionsByClientId = creditExtensionRepository
                .findInEffectAtPump(pumpId, businessClock.today()).stream()
                .collect(Collectors.groupingBy(CreditExtension::getClientId));

        Map<Long, CreditClientStandingResponse> groupStandingByHolderId = new HashMap<>();
        groupIdsByHolderId.forEach((holderId, groupIds) -> {
            CreditClient holder = clientById.get(holderId);
            List<CreditExtension> extensions = extensionsByClientId.getOrDefault(holderId, List.of());
            BigDecimal groupOutstanding = groupIds.stream()
                    .map(id -> outstandingById.getOrDefault(id, BigDecimal.ZERO))
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal availableCredit = null;
            CreditStatus status = CreditStatus.OK;
            if (holder.getCreditLimit().compareTo(BigDecimal.ZERO) > 0) {
                availableCredit = effectiveLimit(holder, extensions).subtract(groupOutstanding).setScale(2, RoundingMode.HALF_UP);
                if (availableCredit.compareTo(BigDecimal.ZERO) <= 0) {
                    status = CreditStatus.OVER_LIMIT;
                    availableCredit = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
                }
            }
            if (status == CreditStatus.OK && !hasCycleWaiver(extensions)
                    && isBillingCycleOverdue(holder.getBillingCycle(), groupOutstanding,
                    latestDate(groupIds, lastPaymentById), earliestDate(groupIds, oldestSaleById))) {
                status = CreditStatus.OVERDUE;
            }
            groupStandingByHolderId.put(holderId, new CreditClientStandingResponse(holderId, status, availableCredit));
        });

        Map<Long, CreditClientStandingResponse> standingById = new HashMap<>();
        for (CreditClient client : clients) {
            CreditClientStandingResponse group = groupStandingByHolderId.get(limitHolderId(client));
            CreditClient parent = client.getParentClientId() != null ? clientById.get(client.getParentClientId()) : null;
            boolean disabled = !client.isActive() || (parent != null && !parent.isActive());
            standingById.put(client.getId(), new CreditClientStandingResponse(client.getId(),
                    disabled ? CreditStatus.INACTIVE : group.creditStatus(), group.availableCredit()));
        }
        return standingById;
    }

    private static BigDecimal effectiveLimit(CreditClient limitHolder, List<CreditExtension> activeExtensions) {
        BigDecimal extensionHeadroom = activeExtensions.stream()
                .filter(extension -> extension.getExtensionType() == CreditExtensionType.AMOUNT_EXTENSION
                        && extension.getExtensionAmount() != null)
                .map(CreditExtension::getExtensionAmount)
                .findFirst()
                .orElse(BigDecimal.ZERO);
        return limitHolder.getCreditLimit().add(extensionHeadroom);
    }

    private static boolean hasCycleWaiver(List<CreditExtension> activeExtensions) {
        return activeExtensions.stream().anyMatch(extension ->
                extension.getExtensionType() == CreditExtensionType.BILLING_CYCLE_EXTENSION
                        || extension.getExtensionType() == CreditExtensionType.OVERDUE_BLOCK_WAIVER);
    }

    /** A group with a balance is overdue when its last payment, or else its oldest sale, is older than one cycle. */
    private boolean isBillingCycleOverdue(BillingCycle billingCycle, BigDecimal groupOutstanding,
                                          LocalDate lastPaymentDate, LocalDate oldestSaleDate) {
        return daysOverdue(billingCycle, groupOutstanding, lastPaymentDate, oldestSaleDate, businessClock.today()) > 0;
    }

    /** Days a group with a balance is past one billing cycle since its last payment, or else its oldest sale; 0 when current. */
    static long daysOverdue(BillingCycle billingCycle, BigDecimal groupOutstanding,
                            LocalDate lastPaymentDate, LocalDate oldestSaleDate, LocalDate today) {
        LocalDate countedFrom = lastPaymentDate != null ? lastPaymentDate : oldestSaleDate;
        if (groupOutstanding.compareTo(BigDecimal.ZERO) <= 0 || countedFrom == null) {
            return 0;
        }
        long cycleDays = billingCycle == BillingCycle.WEEKLY ? 7 : 30;
        return Math.max(0, ChronoUnit.DAYS.between(countedFrom, today) - cycleDays);
    }

    private static LocalDate latestDate(List<Long> clientIds, Map<Long, LocalDate> dateById) {
        return clientIds.stream().map(dateById::get).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
    }

    private static LocalDate earliestDate(List<Long> clientIds, Map<Long, LocalDate> dateById) {
        return clientIds.stream().map(dateById::get).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null);
    }

    private static Map<Long, LocalDate> toDateMap(List<Object[]> rows) {
        Map<Long, LocalDate> dateById = new HashMap<>();
        for (Object[] row : rows) {
            dateById.put((Long) row[0], (LocalDate) row[1]);
        }
        return dateById;
    }
}
