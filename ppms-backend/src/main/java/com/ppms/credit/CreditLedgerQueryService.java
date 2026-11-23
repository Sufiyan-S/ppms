package com.ppms.credit;

import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductQueryService;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.common.time.BusinessClock;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CreditLedgerQueryService {

    private static final String ACTIVE = "ACTIVE";
    private static final String WAIVED = "WAIVED";
    private static final String COUNTER_SALE = "COUNTER_SALE";
    private static final Comparator<CreditTransactionResponse> OLDEST_FIRST =
            Comparator.comparing(CreditTransactionResponse::getBusinessDate)
                    .thenComparing(CreditTransactionResponse::getOccurredAt)
                    .thenComparing(CreditTransactionResponse::getType)
                    .thenComparing(CreditTransactionResponse::getReferenceId);
    private static final Comparator<CreditTransactionResponse> NEWEST_FIRST =
            Comparator.comparing(CreditTransactionResponse::getBusinessDate).reversed()
                    .thenComparing(Comparator.comparing(CreditTransactionResponse::getOccurredAt).reversed())
                    .thenComparing(CreditTransactionResponse::getType)
                    .thenComparing(CreditTransactionResponse::getReferenceId);

    private final CreditClientRepository clientRepository;
    private final CreditPaymentRepository paymentRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final AncillarySaleRepository ancillarySaleRepository;
    private final AncillaryProductRepository ancillaryProductRepository;
    private final CreditInterestService interestService;
    private final UserRepository userRepository;
    private final BusinessClock businessClock;

    public List<CreditClientResponse> getLedgerSummary(Long pumpId) {
        List<CreditClient> clients = clientRepository.findByPumpIdOrderByNameAsc(pumpId);
        List<Long> clientIds = clients.stream().map(CreditClient::getId).toList();
        Map<Long, BigDecimal> outstandingMap = interestService.computeOutstandingBatch(clientIds);
        Map<Long, CreditInterestService.InterestBreakdown> breakdownMap = interestService.computeInterestBreakdownBatch(clientIds);
        Map<Long, List<CreditClient>> childrenByParentId = clients.stream()
                .filter(client -> client.getParentClientId() != null)
                .collect(Collectors.groupingBy(CreditClient::getParentClientId));
        Map<Long, String> nameById = clients.stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        return clients.stream()
                .map(client -> toClientResponse(client, clients, outstandingMap, breakdownMap, childrenByParentId, nameById))
                .sorted(Comparator
                        .comparing(CreditClientResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(CreditClientResponse::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public PagedResponse<CreditTransactionResponse> getTransactions(Long clientId, int page, int size) {
        List<CreditTransactionResponse> transactions = buildTransactionList(clientId);
        transactions.sort(NEWEST_FIRST);
        return PagedResponse.of(transactions, page, size);
    }

    public List<CreditPaymentResponse> getPayments(Long clientId) {
        return mapPayments(paymentRepository.findByClientIdOrderByPaidAtDesc(clientId));
    }

    public List<CreditPaymentResponse> getPendingPayments(Long pumpId) {
        return mapPayments(paymentRepository.findPendingApprovalByPumpId(pumpId));
    }

    public CreditClientResponse toClientResponse(CreditClient client) {
        List<CreditClient> family = new ArrayList<>();
        family.add(client);
        family.addAll(clientRepository.findByParentClientId(client.getId()));
        if (client.getParentClientId() != null) {
            clientRepository.findById(client.getParentClientId()).ifPresent(family::add);
        }
        List<Long> ids = family.stream().map(CreditClient::getId).toList();
        Map<Long, BigDecimal> outstandingByClientId = interestService.computeOutstandingBatch(ids);
        Map<Long, CreditInterestService.InterestBreakdown> breakdownMap = interestService.computeInterestBreakdownBatch(ids);
        Map<Long, List<CreditClient>> childrenByParentId = family.stream()
                .filter(item -> item.getParentClientId() != null)
                .collect(Collectors.groupingBy(CreditClient::getParentClientId));
        Map<Long, String> nameById = family.stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));
        return toClientResponse(client, family, outstandingByClientId, breakdownMap, childrenByParentId, nameById);
    }

    public List<CreditTransactionResponse> getAllTransactions(CreditClient client, boolean includeChildren) {
        List<CreditClient> accounts = new ArrayList<>();
        accounts.add(client);
        if (includeChildren) {
            accounts.addAll(clientRepository.findByParentClientId(client.getId()));
        }
        List<CreditTransactionResponse> transactions = new ArrayList<>();
        for (CreditClient account : accounts) {
            List<CreditTransactionResponse> accountRows = buildTransactionList(account.getId());
            accountRows.forEach(row -> {
                row.setClientId(account.getId());
                row.setClientName(account.getName());
            });
            transactions.addAll(accountRows);
        }
        transactions.sort(NEWEST_FIRST);
        return transactions;
    }

    public CreditStatement getStatement(CreditClient client, LocalDate fromDate, LocalDate toDate) {
        List<CreditClient> subAccounts = client.getParentClientId() == null
                ? clientRepository.findByParentClientId(client.getId())
                : List.of();
        if (subAccounts.isEmpty()) {
            return new CreditStatement(filterByDate(buildTransactionList(client.getId()), fromDate, toDate),
                    interestService.computeOutstanding(client.getId()), List.of());
        }

        List<CreditClient> group = new ArrayList<>();
        group.add(client);
        group.addAll(subAccounts);
        List<CreditTransactionResponse> transactions = new ArrayList<>();
        for (CreditClient account : group) {
            List<CreditTransactionResponse> accountRows = collectTransactions(account.getId());
            accountRows.forEach(row -> {
                row.setClientId(account.getId());
                row.setClientName(account.getName());
            });
            transactions.addAll(accountRows);
        }
        transactions.sort(OLDEST_FIRST);
        applyRunningBalance(transactions);
        return new CreditStatement(filterByDate(transactions, fromDate, toDate),
                interestService.computeOutstandingWithChildren(client.getId()),
                subAccounts.stream().map(CreditClient::getName).toList());
    }

    private static List<CreditTransactionResponse> filterByDate(List<CreditTransactionResponse> transactions,
                                                                LocalDate fromDate, LocalDate toDate) {
        return transactions.stream()
                .filter(tx -> fromDate == null || !tx.getBusinessDate().isBefore(fromDate))
                .filter(tx -> toDate == null || !tx.getBusinessDate().isAfter(toDate))
                .toList();
    }

    private LocalDate businessDateOf(OffsetDateTime moment) {
        return moment.atZoneSameInstant(businessClock.zone()).toLocalDate();
    }

    public CreditPaymentResponse toPaymentResponse(CreditPayment payment, String recordedByName) {
        return CreditPaymentResponse.builder()
                .id(payment.getId())
                .clientId(payment.getClientId())
                .amount(payment.getAmount())
                .paymentMode(payment.getPaymentMode().name())
                .referenceNo(payment.getReferenceNo())
                .notes(payment.getNotes())
                .paidAt(payment.getPaidAt())
                .recordedById(payment.getRecordedById())
                .recordedByUserName(recordedByName)
                .paymentApprovalStatus(payment.getPaymentApprovalStatus().name())
                .approvedByUserId(payment.getApprovedByUserId())
                .approvedAt(payment.getApprovedAt())
                .createdAt(payment.getCreatedAt())
                .build();
    }

    private List<CreditPaymentResponse> mapPayments(List<CreditPayment> payments) {
        Map<Long, String> nameById = loadUserNames(payments.stream()
                .map(CreditPayment::getRecordedById)
                .collect(Collectors.toSet()));
        return payments.stream()
                .map(payment -> toPaymentResponse(payment, nameById.getOrDefault(payment.getRecordedById(), "Unknown")))
                .toList();
    }

    /**
     * Centralizes ledger transaction assembly so controllers and HTML rendering reuse the
     * exact same ordering and running-balance rules.
     */
    private List<CreditTransactionResponse> buildTransactionList(Long clientId) {
        List<CreditTransactionResponse> transactions = collectTransactions(clientId);
        transactions.sort(OLDEST_FIRST);
        applyRunningBalance(transactions);
        return transactions;
    }

    private List<CreditTransactionResponse> collectTransactions(Long clientId) {
        List<CreditTransactionResponse> transactions = new ArrayList<>();

        creditEntryRepository.findByClientIdOrderByCreatedAtDesc(clientId)
                .forEach(sale -> transactions.add(CreditTransactionResponse.builder()
                        .type("SALE")
                        .referenceId(sale.getId())
                        .reference(sale.getDescription())
                        .detail(sale.getFuelType())
                        .amount(sale.getAmount().setScale(2, RoundingMode.HALF_UP))
                        .occurredAt(sale.getCreatedAt())
                        .businessDate(sale.getSaleDate())
                        .status(sale.getVoidStatus())
                        .countedInBalance(ACTIVE.equals(sale.getVoidStatus()))
                        .build()));

        List<AncillarySale> counterSales = ancillarySaleRepository.findByClientIdsAndPaymentMode(
                List.of(clientId), TransactionPaymentMode.CREDIT);
        Map<Long, AncillaryProduct> productsById = ancillaryProductRepository.findAllById(counterSales.stream()
                        .map(AncillarySale::getProductId)
                        .collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(AncillaryProduct::getId, Function.identity()));
        counterSales.forEach(sale -> transactions.add(CreditTransactionResponse.builder()
                .type(COUNTER_SALE)
                .referenceId(sale.getId())
                .reference(counterSaleLabel(sale, productsById.get(sale.getProductId())))
                .amount(sale.getTotalWithGst().setScale(2, RoundingMode.HALF_UP))
                .occurredAt(sale.getCreatedAt())
                .businessDate(sale.getSaleDate())
                .status(ACTIVE)
                .countedInBalance(true)
                .build()));

        List<CreditPayment> payments = paymentRepository.findByClientIdOrderByPaidAtDesc(clientId);
        Map<Long, String> paymentUserNames = loadUserNames(payments.stream()
                .map(CreditPayment::getRecordedById)
                .collect(Collectors.toSet()));
        payments.forEach(payment -> {
            String recordedBy = paymentUserNames.getOrDefault(payment.getRecordedById(), "Unknown");
            transactions.add(CreditTransactionResponse.builder()
                    .type("PAYMENT")
                    .referenceId(payment.getId())
                    .reference(payment.getNotes() != null ? payment.getNotes() : recordedBy)
                    .detail(payment.getPaymentMode().name())
                    .amount(payment.getAmount().setScale(2, RoundingMode.HALF_UP))
                    .occurredAt(payment.getCreatedAt())
                    .businessDate(payment.getPaidAt())
                    .status(payment.getPaymentApprovalStatus().name())
                    .countedInBalance(payment.getPaymentApprovalStatus() == ExpenseApprovalStatus.APPROVED)
                    .build());
        });

        interestChargeRepository.findByClientIdOrderByCreatedAtDesc(clientId)
                .forEach(charge -> {
                    String label = String.format("%d days @ %.2f%%/month", charge.getDaysApplied(), charge.getRateApplied());
                    Map<String, Object> labelParams = new LinkedHashMap<>();
                    labelParams.put("days", charge.getDaysApplied());
                    labelParams.put("rate", charge.getRateApplied().setScale(2, RoundingMode.HALF_UP));
                    transactions.add(CreditTransactionResponse.builder()
                            .type("INTEREST")
                            .referenceId(charge.getId())
                            .reference(label)
                            .referenceCode(ServerTextCodes.INTEREST_CHARGE_DETAILS)
                            .referenceParams(labelParams)
                            .detail(String.format("%s – %s", charge.getPeriodFrom(), charge.getPeriodTo()))
                            .amount(charge.getAmount().setScale(2, RoundingMode.HALF_UP))
                            .occurredAt(charge.getCreatedAt())
                            .businessDate(businessDateOf(charge.getCreatedAt()))
                            .status(charge.getVoidedAt() == null ? ACTIVE : WAIVED)
                            .countedInBalance(charge.getVoidedAt() == null)
                            .build());
                });
        return transactions;
    }

    /** Expects the rows oldest first; rows not counted in the balance carry the balance before them. */
    private static void applyRunningBalance(List<CreditTransactionResponse> transactions) {
        BigDecimal runningBalance = BigDecimal.ZERO;
        for (CreditTransactionResponse transaction : transactions) {
            if (!transaction.isCountedInBalance()) {
                transaction.setRunningBalance(runningBalance.setScale(2, RoundingMode.HALF_UP));
                continue;
            }
            if ("PAYMENT".equals(transaction.getType())) {
                runningBalance = runningBalance.subtract(transaction.getAmount());
            } else {
                runningBalance = runningBalance.add(transaction.getAmount());
            }
            transaction.setRunningBalance(runningBalance.setScale(2, RoundingMode.HALF_UP));
        }
    }

    private static String counterSaleLabel(AncillarySale sale, AncillaryProduct product) {
        String productName = product != null ? AncillaryProductQueryService.buildDisplayName(product) : "Product";
        String label = productName + " × " + sale.getQuantityUnits();
        return sale.getBillNo() != null && !sale.getBillNo().isBlank()
                ? label + " (Bill " + sale.getBillNo() + ")"
                : label;
    }

    private CreditClientResponse toClientResponse(CreditClient client,
                                                  List<CreditClient> allPumpClients,
                                                  Map<Long, BigDecimal> outstandingByClientId,
                                                  Map<Long, CreditInterestService.InterestBreakdown> breakdownMap,
                                                  Map<Long, List<CreditClient>> childrenByParentId,
                                                  Map<Long, String> nameById) {
        boolean isParent = client.getParentClientId() == null && childrenByParentId.containsKey(client.getId());
        BigDecimal outstanding = outstandingByClientId.getOrDefault(client.getId(), BigDecimal.ZERO);
        CreditInterestService.InterestBreakdown breakdown = breakdownMap.getOrDefault(client.getId(), CreditInterestService.InterestBreakdown.ZERO);

        if (isParent) {
            List<CreditClient> children = childrenByParentId.get(client.getId());
            BigDecimal childOutstanding = children.stream()
                    .map(child -> outstandingByClientId.getOrDefault(child.getId(), BigDecimal.ZERO))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            outstanding = outstanding.add(childOutstanding);

            CreditInterestService.InterestBreakdown childBreakdown = children.stream()
                    .map(child -> breakdownMap.getOrDefault(child.getId(), CreditInterestService.InterestBreakdown.ZERO))
                    .reduce(CreditInterestService.InterestBreakdown.ZERO, CreditInterestService.InterestBreakdown::add);
            breakdown = breakdown.add(childBreakdown);
        }

        return CreditClientResponse.builder()
                .id(client.getId())
                .pumpId(client.getPumpId())
                .name(client.getName())
                .phone(client.getPhone())
                .notes(client.getNotes())
                .creditLimit(client.getCreditLimit())
                .outstandingBalance(outstanding.setScale(2, RoundingMode.HALF_UP))
                .outstandingInterest(breakdown.outstandingInterest())
                .totalInterestRecovered(breakdown.totalInterestRecovered())
                .monthlyInterestRate(client.getMonthlyInterestRate())
                .interestGraceDays(client.getInterestGraceDays())
                .createdAt(client.getCreatedAt())
                .parentClientId(client.getParentClientId())
                .parentClientName(client.getParentClientId() != null ? nameById.get(client.getParentClientId()) : null)
                .isParent(isParent)
                .build();
    }

    private Map<Long, String> loadUserNames(Set<Long> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));
    }
}
