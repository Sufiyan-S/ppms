package com.ppms.credit;

import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.common.time.BusinessClock;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.transaction.TransactionPaymentMode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Splits each credit account's balance by how old the sales and interest behind it are. Payments are taken to cover
 * the oldest amounts first, so the balance is made of the newest ones. Loads the whole pump in a fixed number of queries.
 */
@Service
@RequiredArgsConstructor
public class CreditAgingService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    private final CreditClientRepository clientRepository;
    private final CreditPaymentRepository paymentRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final AncillarySaleRepository ancillarySaleRepository;
    private final CreditInterestService interestService;
    private final CreditAccountPolicyService accountPolicyService;
    private final BusinessClock businessClock;

    private record Debit(LocalDate date, BigDecimal amount, boolean isSale) {}

    @Transactional(readOnly = true)
    public CreditAgingResponse agingOfPump(Long pumpId) {
        List<CreditClient> clients = clientRepository.findByPumpIdOrderByNameAsc(pumpId);
        if (clients.isEmpty()) {
            return new CreditAgingResponse(new CreditAgingResponse.Summary(ZERO, ZERO, ZERO, 0, 0, 0), List.of());
        }
        List<Long> clientIds = clients.stream().map(CreditClient::getId).toList();
        Map<Long, Long> holderIdByClientId = clients.stream()
                .collect(Collectors.toMap(CreditClient::getId, accountPolicyService::limitHolderId));
        Map<Long, List<Long>> groupIdsByHolderId = clientIds.stream()
                .collect(Collectors.groupingBy(holderIdByClientId::get));

        Map<Long, BigDecimal> outstandingById = interestService.computeOutstandingBatch(clientIds);
        Map<Long, CreditClientStandingResponse> standingById = accountPolicyService.creditStandingOfPumpClients(pumpId);
        Map<Long, List<Debit>> debitsByHolderId = debitsByHolderId(clientIds, holderIdByClientId);
        Map<Long, LocalDate> lastPaymentByHolderId = latestPerHolder(
                paymentRepository.findLastPaymentDatesByClientIds(clientIds), holderIdByClientId);
        Map<Long, LocalDate> oldestSaleByHolderId = new HashMap<>();
        interestService.findOldestCreditSaleDates(clientIds).forEach((clientId, date) ->
                oldestSaleByHolderId.merge(holderIdByClientId.get(clientId), date,
                        (first, second) -> first.isBefore(second) ? first : second));
        List<CreditPayment> pendingPayments = paymentRepository.findPendingApprovalByPumpId(pumpId);

        LocalDate today = businessClock.today();
        List<CreditAgingResponse.Row> rows = new ArrayList<>();
        for (CreditClient holder : clients) {
            if (holder.getParentClientId() != null) {
                continue;
            }
            List<Long> groupIds = groupIdsByHolderId.get(holder.getId());
            BigDecimal outstanding = groupIds.stream()
                    .map(id -> outstandingById.getOrDefault(id, BigDecimal.ZERO))
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
            List<CreditPayment> groupPending = pendingPayments.stream()
                    .filter(payment -> groupIds.contains(payment.getClientId()))
                    .toList();
            rows.add(toRow(holder, groupIds.size() - 1, outstanding,
                    debitsByHolderId.getOrDefault(holder.getId(), List.of()),
                    lastPaymentByHolderId.get(holder.getId()), oldestSaleByHolderId.get(holder.getId()),
                    standingById.get(holder.getId()), groupPending, today));
        }
        return new CreditAgingResponse(summaryOf(rows), rows);
    }

    private CreditAgingResponse.Row toRow(CreditClient holder, int subAccountCount, BigDecimal outstanding,
                                          List<Debit> debits, LocalDate lastPaymentDate, LocalDate oldestSaleDate,
                                          CreditClientStandingResponse standing, List<CreditPayment> pendingPayments,
                                          LocalDate today) {
        BigDecimal[] buckets = {BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO};
        LocalDate oldestUnpaidSaleDate = null;
        BigDecimal remaining = outstanding.max(BigDecimal.ZERO);
        List<Debit> newestFirst = debits.stream().sorted(Comparator.comparing(Debit::date).reversed()).toList();
        for (Debit debit : newestFirst) {
            if (remaining.signum() <= 0) {
                break;
            }
            BigDecimal unpaid = debit.amount().min(remaining);
            remaining = remaining.subtract(unpaid);
            buckets[bucketOf(debit.date(), today)] = buckets[bucketOf(debit.date(), today)].add(unpaid);
            if (debit.isSale()) {
                oldestUnpaidSaleDate = debit.date();
            }
        }
        if (remaining.signum() > 0) {
            LocalDate oldestDebitDate = newestFirst.isEmpty() ? today : newestFirst.get(newestFirst.size() - 1).date();
            buckets[bucketOf(oldestDebitDate, today)] = buckets[bucketOf(oldestDebitDate, today)].add(remaining);
        }

        return new CreditAgingResponse.Row(holder.getId(), holder.getName(), holder.getPhone(), subAccountCount,
                holder.getBillingCycle(), holder.getCreditLimit().setScale(2, RoundingMode.HALF_UP), outstanding,
                money(buckets[0]), money(buckets[1]), money(buckets[2]), money(buckets[3]),
                oldestUnpaidSaleDate, lastPaymentDate,
                CreditAccountPolicyService.daysOverdue(holder.getBillingCycle(), outstanding, lastPaymentDate,
                        oldestSaleDate, today),
                standing != null ? standing.creditStatus() : CreditStatus.OK,
                pendingPayments.size(),
                money(pendingPayments.stream().map(CreditPayment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add)));
    }

    private static int bucketOf(LocalDate date, LocalDate today) {
        long age = ChronoUnit.DAYS.between(date, today);
        if (age <= 30) {
            return 0;
        }
        if (age <= 60) {
            return 1;
        }
        return age <= 90 ? 2 : 3;
    }

    private Map<Long, List<Debit>> debitsByHolderId(List<Long> clientIds, Map<Long, Long> holderIdByClientId) {
        Map<Long, List<Debit>> debits = new HashMap<>();
        for (ShiftCreditEntry entry : creditEntryRepository.findActiveByClientIdIn(clientIds)) {
            debits.computeIfAbsent(holderIdByClientId.get(entry.getClientId()), id -> new ArrayList<>())
                    .add(new Debit(entry.getSaleDate(), entry.getAmount(), true));
        }
        for (AncillarySale sale : ancillarySaleRepository.findByClientIdsAndPaymentMode(clientIds, TransactionPaymentMode.CREDIT)) {
            debits.computeIfAbsent(holderIdByClientId.get(sale.getClientId()), id -> new ArrayList<>())
                    .add(new Debit(sale.getSaleDate(), sale.getTotalWithGst(), true));
        }
        for (CreditInterestCharge charge : interestChargeRepository.findByClientIdInAndVoidedAtIsNull(clientIds)) {
            debits.computeIfAbsent(holderIdByClientId.get(charge.getClientId()), id -> new ArrayList<>())
                    .add(new Debit(charge.getPeriodTo(), charge.getAmount(), false));
        }
        return debits;
    }

    private static Map<Long, LocalDate> latestPerHolder(List<Object[]> rows, Map<Long, Long> holderIdByClientId) {
        Map<Long, LocalDate> latest = new HashMap<>();
        for (Object[] row : rows) {
            latest.merge(holderIdByClientId.get((Long) row[0]), (LocalDate) row[1],
                    (first, second) -> first.isAfter(second) ? first : second);
        }
        return latest;
    }

    private static CreditAgingResponse.Summary summaryOf(List<CreditAgingResponse.Row> rows) {
        BigDecimal total = sum(rows.stream().map(CreditAgingResponse.Row::outstanding).toList());
        BigDecimal overdue = sum(rows.stream().filter(row -> row.daysOverdue() > 0)
                .map(CreditAgingResponse.Row::outstanding).toList());
        BigDecimal overSixty = sum(rows.stream().map(row -> row.days61To90().add(row.over90Days())).toList());
        return new CreditAgingResponse.Summary(total, overdue, overSixty,
                (int) rows.stream().filter(row -> row.daysOverdue() > 0).count(),
                (int) rows.stream().filter(row -> row.creditStatus() == CreditStatus.OVER_LIMIT).count(),
                (int) rows.stream().filter(row -> row.pendingPaymentCount() > 0).count());
    }

    private static BigDecimal sum(List<BigDecimal> amounts) {
        return money(amounts.stream().filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private static BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }
}
