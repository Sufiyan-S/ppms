package com.ppms.credit;

import com.ppms.common.dto.PagedResponse;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CreditLedgerQueryService {

    private final CreditClientRepository clientRepository;
    private final CreditPaymentRepository paymentRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final CreditInterestService interestService;
    private final UserRepository userRepository;

    public List<CreditClientResponse> getLedgerSummary(Long pumpId) {
        List<CreditClient> clients = clientRepository.findByPumpIdOrderByNameAsc(pumpId);
        List<Long> clientIds = clients.stream().map(CreditClient::getId).toList();
        Map<Long, BigDecimal> outstandingMap = interestService.computeOutstandingBatch(clientIds);
        Map<Long, List<CreditClient>> childrenByParentId = clients.stream()
                .filter(client -> client.getParentClientId() != null)
                .collect(Collectors.groupingBy(CreditClient::getParentClientId));
        Map<Long, String> nameById = clients.stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        return clients.stream()
                .map(client -> toClientResponse(client, clients, outstandingMap, childrenByParentId, nameById))
                .sorted(Comparator
                        .comparing(CreditClientResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(CreditClientResponse::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public PagedResponse<CreditTransactionResponse> getTransactions(Long clientId, int page, int size) {
        List<CreditTransactionResponse> transactions = buildTransactionList(clientId);
        transactions.sort(Comparator.comparing(CreditTransactionResponse::getOccurredAt).reversed()
                .thenComparing(CreditTransactionResponse::getType)
                .thenComparing(CreditTransactionResponse::getReferenceId));
        return PagedResponse.of(transactions, page, size);
    }

    public List<CreditPaymentResponse> getPayments(Long clientId) {
        return mapPayments(paymentRepository.findByClientIdOrderByPaidAtDesc(clientId));
    }

    public List<CreditPaymentResponse> getPendingPayments(Long pumpId) {
        return mapPayments(paymentRepository.findPendingApprovalByPumpId(pumpId));
    }

    public CreditClientResponse toClientResponse(CreditClient client, List<CreditClient> allPumpClients) {
        Map<Long, BigDecimal> outstandingByClientId = interestService.computeOutstandingBatch(
                allPumpClients.stream().map(CreditClient::getId).toList());
        Map<Long, List<CreditClient>> childrenByParentId = allPumpClients.stream()
                .filter(item -> item.getParentClientId() != null)
                .collect(Collectors.groupingBy(CreditClient::getParentClientId));
        Map<Long, String> nameById = allPumpClients.stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));
        return toClientResponse(client, allPumpClients, outstandingByClientId, childrenByParentId, nameById);
    }

    public List<CreditTransactionResponse> getStatementTransactions(Long clientId, LocalDate fromDate, LocalDate toDate) {
        return buildTransactionList(clientId).stream()
                .filter(tx -> fromDate == null || !tx.getOccurredAt().toLocalDate().isBefore(fromDate))
                .filter(tx -> toDate == null || !tx.getOccurredAt().toLocalDate().isAfter(toDate))
                .toList();
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
        List<CreditTransactionResponse> transactions = new ArrayList<>();

        creditEntryRepository.findByClientIdOrderByCreatedAtDesc(clientId)
                .forEach(sale -> transactions.add(CreditTransactionResponse.builder()
                        .type("SALE")
                        .referenceId(sale.getId())
                        .reference(sale.getDescription())
                        .detail(sale.getFuelType())
                        .amount(sale.getAmount().setScale(2, RoundingMode.HALF_UP))
                        .occurredAt(sale.getCreatedAt())
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
                    .build());
        });

        interestChargeRepository.findByClientIdOrderByCreatedAtDesc(clientId)
                .forEach(charge -> {
                    String label = String.format("%d days @ %.2f%%/month", charge.getDaysApplied(), charge.getRateApplied());
                    transactions.add(CreditTransactionResponse.builder()
                            .type("INTEREST")
                            .referenceId(charge.getId())
                            .reference(label)
                            .detail(String.format("%s – %s", charge.getPeriodFrom(), charge.getPeriodTo()))
                            .amount(charge.getAmount().setScale(2, RoundingMode.HALF_UP))
                            .occurredAt(charge.getCreatedAt())
                            .build());
                });

        transactions.sort(Comparator.comparing(CreditTransactionResponse::getOccurredAt)
                .thenComparing(CreditTransactionResponse::getType)
                .thenComparing(CreditTransactionResponse::getReferenceId));

        BigDecimal runningBalance = BigDecimal.ZERO;
        for (CreditTransactionResponse transaction : transactions) {
            if ("PAYMENT".equals(transaction.getType())) {
                runningBalance = runningBalance.subtract(transaction.getAmount());
            } else {
                runningBalance = runningBalance.add(transaction.getAmount());
            }
            transaction.setRunningBalance(runningBalance.setScale(2, RoundingMode.HALF_UP));
        }

        return transactions;
    }

    private CreditClientResponse toClientResponse(CreditClient client,
                                                  List<CreditClient> allPumpClients,
                                                  Map<Long, BigDecimal> outstandingByClientId,
                                                  Map<Long, List<CreditClient>> childrenByParentId,
                                                  Map<Long, String> nameById) {
        boolean isParent = client.getParentClientId() == null && childrenByParentId.containsKey(client.getId());
        BigDecimal outstanding = outstandingByClientId.getOrDefault(client.getId(), BigDecimal.ZERO);
        if (isParent) {
            BigDecimal childOutstanding = childrenByParentId.get(client.getId()).stream()
                    .map(child -> outstandingByClientId.getOrDefault(child.getId(), BigDecimal.ZERO))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            outstanding = outstanding.add(childOutstanding);
        }

        return CreditClientResponse.builder()
                .id(client.getId())
                .pumpId(client.getPumpId())
                .name(client.getName())
                .phone(client.getPhone())
                .notes(client.getNotes())
                .creditLimit(client.getCreditLimit())
                .outstandingBalance(outstanding.setScale(2, RoundingMode.HALF_UP))
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
