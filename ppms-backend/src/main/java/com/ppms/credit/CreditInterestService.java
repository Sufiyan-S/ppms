package com.ppms.credit;

import com.ppms.shift.ShiftCreditEntryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Handles all interest calculation and application logic for credit clients.
 *
 * Interest model:
 *   - Simple interest: amount = outstanding × (rate / 100) × (days / 30)
 *   - Rate is configured on the parent account and inherited by all sub-accounts.
 *   - Interest is applied per entity: each sub-account and the parent itself each get
 *     their own interest charge row based on their own transactions only.
 *   - Applying interest on a parent cascades to all its sub-accounts automatically.
 *   - Grace period: interest does not start until X days after the first credit sale
 *   - period_from is always the day after the last applied period ended (or first eligible date)
 *   - period_to is today's date (for manual) or end of previous month (for scheduled)
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditInterestService {

    private static final BigDecimal DAYS_IN_MONTH = new BigDecimal("30");

    private final CreditClientRepository clientRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final CreditPaymentRepository paymentRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;

    // ── Outstanding balance ───────────────────────────────────────────────────

    /**
     * Computes the true outstanding balance for a client (own transactions only):
     *   outstanding = sum(credit_sales) + sum(interest_charges) − sum(payments)
     */
    public BigDecimal computeOutstanding(Long clientId) {
        BigDecimal sales    = creditEntryRepository.sumAmountByClientId(clientId);
        BigDecimal interest = interestChargeRepository.sumAmountByClientId(clientId);
        BigDecimal paid     = paymentRepository.sumAmountByClientId(clientId);
        return sales.add(interest).subtract(paid).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Computes the combined outstanding balance for a parent account including all sub-accounts.
     * Used for displaying the group liability on the Credit page and for credit limit enforcement.
     */
    public BigDecimal computeOutstandingWithChildren(Long clientId) {
        BigDecimal own = computeOutstanding(clientId);
        List<CreditClient> children = clientRepository.findByParentClientId(clientId);
        if (children.isEmpty()) {
            return own;
        }
        List<Long> childIds = children.stream().map(CreditClient::getId).toList();
        Map<Long, BigDecimal> childBalances = computeOutstandingBatch(childIds);
        BigDecimal childrenSum = childBalances.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return own.add(childrenSum).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Batch version of computeOutstanding — resolves outstanding balance for all clients in 3 DB
     * queries total (one per table), instead of 3 queries per client.
     */
    public Map<Long, BigDecimal> computeOutstandingBatch(Collection<Long> clientIds) {
        if (clientIds.isEmpty()) return Map.of();

        Map<Long, BigDecimal> salesMap    = toAmountMap(creditEntryRepository.sumAmountsByClientIds(clientIds));
        Map<Long, BigDecimal> interestMap = toAmountMap(interestChargeRepository.sumAmountsByClientIds(clientIds));
        Map<Long, BigDecimal> paymentsMap = toAmountMap(paymentRepository.sumAmountsByClientIds(clientIds));

        return clientIds.stream().collect(Collectors.toMap(
                id -> id,
                id -> salesMap.getOrDefault(id, BigDecimal.ZERO)
                        .add(interestMap.getOrDefault(id, BigDecimal.ZERO))
                        .subtract(paymentsMap.getOrDefault(id, BigDecimal.ZERO))
                        .setScale(2, RoundingMode.HALF_UP)
        ));
    }

    /**
     * Holds the interest breakdown for a single client account:
     *   outstandingInterest  — portion of the outstanding balance that is unpaid interest
     *   totalInterestRecovered — total interest covered by payments (interest-first allocation)
     */
    public record InterestBreakdown(BigDecimal outstandingInterest, BigDecimal totalInterestRecovered) {
        public static final InterestBreakdown ZERO =
            new InterestBreakdown(BigDecimal.ZERO, BigDecimal.ZERO);

        public InterestBreakdown add(InterestBreakdown other) {
            return new InterestBreakdown(
                this.outstandingInterest.add(other.outstandingInterest),
                this.totalInterestRecovered.add(other.totalInterestRecovered)
            );
        }
    }

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /**
     * Batch version — resolves interest breakdown for all clients in 2 DB queries total.
     * Uses chronological simulation: processes interest charges and payments in date order
     * so that a payment made BEFORE an interest charge is NOT counted as recovering that interest.
     * On the same date, interest charges are processed before payments.
     */
    public Map<Long, InterestBreakdown> computeInterestBreakdownBatch(Collection<Long> clientIds) {
        if (clientIds.isEmpty()) return Map.of();

        List<CreditInterestCharge> allCharges = interestChargeRepository.findByClientIdIn(clientIds);
        List<CreditPayment> allPayments = paymentRepository.findApprovedByClientIdIn(clientIds);

        Map<Long, List<CreditInterestCharge>> chargesByClient = allCharges.stream()
                .collect(Collectors.groupingBy(CreditInterestCharge::getClientId));
        Map<Long, List<CreditPayment>> paymentsByClient = allPayments.stream()
                .collect(Collectors.groupingBy(CreditPayment::getClientId));

        return clientIds.stream().collect(Collectors.toMap(
                id -> id,
                id -> simulateInterestFirstAllocation(
                        chargesByClient.getOrDefault(id, List.of()),
                        paymentsByClient.getOrDefault(id, List.of())
                )
        ));
    }

    /**
     * Simulates interest-first payment allocation in chronological order.
     * Each interest charge adds to an "interest bucket"; each payment drains it first.
     * Only the portion of payments that overlaps with an existing interest bucket counts as recovered.
     */
    private InterestBreakdown simulateInterestFirstAllocation(
            List<CreditInterestCharge> charges,
            List<CreditPayment> payments) {

        if (charges.isEmpty()) return InterestBreakdown.ZERO;

        record Event(LocalDate date, BigDecimal amount, boolean isInterest) {}

        List<Event> events = new ArrayList<>();
        charges.forEach(c -> events.add(new Event(
                c.getCreatedAt().atZoneSameInstant(IST).toLocalDate(), c.getAmount(), true)));
        payments.forEach(p -> events.add(new Event(p.getPaidAt(), p.getAmount(), false)));

        // Same-date: interest charges before payments so they can be immediately drained
        events.sort(Comparator.comparing(Event::date).thenComparing(e -> e.isInterest() ? 0 : 1));

        BigDecimal interestBucket = BigDecimal.ZERO;
        BigDecimal recovered = BigDecimal.ZERO;

        for (Event event : events) {
            if (event.isInterest()) {
                interestBucket = interestBucket.add(event.amount());
            } else {
                BigDecimal interestPaid = event.amount().min(interestBucket);
                interestBucket = interestBucket.subtract(interestPaid);
                recovered = recovered.add(interestPaid);
            }
        }

        return new InterestBreakdown(
                interestBucket.setScale(2, RoundingMode.HALF_UP),
                recovered.setScale(2, RoundingMode.HALF_UP)
        );
    }

    /**
     * Computes the total interest ever charged to a client (and all its sub-accounts if parent).
     * Used for the "Interest Recovered" stat on the client detail page.
     */
    public BigDecimal computeTotalInterestRecovered(Long clientId) {
        BigDecimal own = interestChargeRepository.sumAmountByClientId(clientId);
        List<CreditClient> children = clientRepository.findByParentClientId(clientId);
        if (children.isEmpty()) {
            return own;
        }
        List<Long> childIds = children.stream().map(CreditClient::getId).toList();
        Map<Long, BigDecimal> childInterest = toAmountMap(interestChargeRepository.sumAmountsByClientIds(childIds));
        BigDecimal childrenSum = childInterest.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return own.add(childrenSum).setScale(2, RoundingMode.HALF_UP);
    }

    /** Converts JPQL GROUP BY result rows [clientId, sumAmount] into a clientId → amount map. */
    private static Map<Long, BigDecimal> toAmountMap(List<Object[]> rows) {
        Map<Long, BigDecimal> map = new HashMap<>();
        for (Object[] row : rows) {
            Long id = (Long) row[0];
            BigDecimal amount = row[1] instanceof BigDecimal bd ? bd : new BigDecimal(row[1].toString());
            map.put(id, amount);
        }
        return map;
    }

    // ── Manual application (triggered by owner/admin via API) ──────────────────

    /**
     * Applies pro-rata simple interest for a single client up to today.
     * If the client is a parent account, interest is also cascaded to all sub-accounts —
     * each sub-account receives its own interest charge based on its own transactions.
     *
     * Returns the charge applied to the specified client itself (not sub-accounts).
     */
    @Transactional
    public Optional<CreditInterestCharge> applyProRata(Long pumpId, Long clientId, Long appliedByUserId) {
        CreditClient client = clientRepository.findById(clientId)
                .orElseThrow(() -> new com.ppms.common.exception.ResourceNotFoundException("Client not found: " + clientId));

        Optional<CreditInterestCharge> result = applyInterest(client, LocalDate.now(), "MANUAL", appliedByUserId);

        // Cascade to all sub-accounts: each gets its own interest row based on own transactions
        List<CreditClient> children = clientRepository.findByParentClientId(clientId);
        for (CreditClient child : children) {
            try {
                applyInterest(child, LocalDate.now(), "MANUAL", appliedByUserId);
            } catch (Exception e) {
                log.error("Interest application failed for sub-account={} under parent={}: {}",
                        child.getId(), clientId, e.getMessage(), e);
            }
        }

        return result;
    }

    /**
     * Result of a bulk interest application run.
     *
     * @param charged     number of root clients that received an interest charge
     * @param skipped     number of root clients skipped (zero balance, within grace period, etc.)
     * @param failed      number of root clients where the application threw an exception
     * @param failedClientIds  IDs of clients that failed — operator can retry or investigate
     */
    public record InterestApplicationResult(int charged, int skipped, int failed, List<Long> failedClientIds) {}

    /**
     * Applies pro-rata interest to ALL eligible root clients for a pump up to today.
     * Sub-accounts are processed automatically during their parent's cascade.
     *
     * Each client runs in its own transaction (via {@link #applyProRata}).
     * Failures are caught, logged, and included in the returned result so the caller
     * can surface them to the operator — a partial run is no longer silently hidden.
     */
    public InterestApplicationResult applyProRataForAllClients(Long pumpId, Long appliedByUserId) {
        List<CreditClient> clients = clientRepository.findByPumpIdOrderByNameAsc(pumpId);
        int charged = 0;
        int skipped = 0;
        List<Long> failedClientIds = new ArrayList<>();

        for (CreditClient client : clients) {
            // Sub-accounts are processed when their parent is processed — skip them here
            if (client.getParentClientId() != null) continue;
            try {
                Optional<CreditInterestCharge> charge = applyProRata(pumpId, client.getId(), appliedByUserId);
                if (charge.isPresent()) {
                    charged++;
                } else {
                    skipped++;
                }
            } catch (Exception e) {
                log.error("Interest application failed for client={} on pump={}: {}",
                        client.getId(), pumpId, e.getMessage(), e);
                failedClientIds.add(client.getId());
            }
        }

        int failed = failedClientIds.size();
        long rootCount = clients.stream().filter(c -> c.getParentClientId() == null).count();
        log.info("Pro-rata interest applied for pump={}: charged={}, skipped={}, failed={}/{}",
                pumpId, charged, skipped, failed, rootCount);
        return new InterestApplicationResult(charged, skipped, failed, failedClientIds);
    }

    // ── Scheduled job entry points (called by InterestStagingJob) ────────────

    /**
     * Applies interest for all root clients with the given interestPeriod, up to periodTo.
     * Sub-accounts are cascaded from the parent — they inherit the parent's rate.
     */
    @Transactional
    public int applyInterestForPeriod(InterestPeriod period, LocalDate periodTo, String source) {
        List<CreditClient> clients = clientRepository.findByInterestPeriod(period);

        List<Long> parentIds = clients.stream()
                .filter(c -> c.getParentClientId() == null)
                .map(CreditClient::getId)
                .toList();

        // Batch-fetch all children in one query instead of one query per parent
        Map<Long, List<CreditClient>> childrenByParentId = clientRepository
                .findByParentClientIdIn(parentIds)
                .stream()
                .collect(Collectors.groupingBy(CreditClient::getParentClientId));

        int charged = 0;
        for (CreditClient client : clients) {
            // Sub-accounts are cascaded from their parent — skip them in the main loop
            if (client.getParentClientId() != null) continue;

            Optional<CreditInterestCharge> charge = applyInterest(client, periodTo, source, null);
            if (charge.isPresent()) charged++;

            // Cascade to sub-accounts using the pre-fetched map
            for (CreditClient child : childrenByParentId.getOrDefault(client.getId(), List.of())) {
                try {
                    Optional<CreditInterestCharge> childCharge = applyInterest(child, periodTo, source, null);
                    if (childCharge.isPresent()) charged++;
                } catch (Exception e) {
                    log.error("Scheduled interest failed for sub-account={} under parent={}: {}",
                            child.getId(), client.getId(), e.getMessage(), e);
                }
            }
        }

        log.info("Interest staged: period={}, source={}, charged={}/{}", period, source, charged, clients.size());
        return charged;
    }

    // ── Core calculation ──────────────────────────────────────────────────────

    /**
     * Core interest application logic shared by manual and scheduled triggers.
     *
     * Interest is always calculated on the client's OWN transactions only (not children).
     * Sub-accounts inherit the parent's interest rate if they do not have their own configured.
     *
     * @param client        the client to charge
     * @param periodTo      the last date (inclusive) to cover — today for manual, yesterday for scheduled
     * @param source        "MANUAL" or "MONTHLY_SCHEDULED"
     * @param appliedByUserId  the user ID triggering the charge (null for scheduled)
     * @return the saved charge, or empty if the client was not eligible
     */
    private Optional<CreditInterestCharge> applyInterest(
            CreditClient client, LocalDate periodTo, String source, Long appliedByUserId) {

        // Resolve effective interest rate — sub-accounts inherit from parent if not set
        BigDecimal rate = resolveInterestRate(client);
        if (rate.compareTo(BigDecimal.ZERO) <= 0) {
            return Optional.empty();
        }

        // Interest is based on this client's own outstanding balance only (not children)
        BigDecimal outstanding = computeOutstanding(client.getId());

        // No interest if nothing is owed
        if (outstanding.compareTo(BigDecimal.ZERO) <= 0) {
            return Optional.empty();
        }

        // Determine period_from
        LocalDate periodFrom = determinePeriodFrom(client);
        if (periodFrom == null) {
            // No credit entries yet — nothing to charge
            return Optional.empty();
        }

        // Nothing to charge if the window has not opened yet
        if (!periodFrom.isBefore(periodTo) && !periodFrom.isEqual(periodTo)) {
            log.debug("Client {} interest skipped: period_from {} >= period_to {}", client.getId(), periodFrom, periodTo);
            return Optional.empty();
        }

        long days = ChronoUnit.DAYS.between(periodFrom, periodTo) + 1;
        if (days <= 0) {
            return Optional.empty();
        }

        // Simple interest: amount = outstanding × (rate / 100) × (days / 30)
        BigDecimal interest = outstanding
                .multiply(rate)
                .divide(new BigDecimal("100"), 10, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(days))
                .divide(DAYS_IN_MONTH, 2, RoundingMode.HALF_UP);

        // Skip negligible amounts (< ₹0.01)
        if (interest.compareTo(new BigDecimal("0.01")) < 0) {
            log.debug("Client {} interest skipped: calculated amount {} is negligible", client.getId(), interest);
            return Optional.empty();
        }

        CreditInterestCharge charge = CreditInterestCharge.builder()
                .pumpId(client.getPumpId())
                .clientId(client.getId())
                .amount(interest)
                .outstandingBalance(outstanding)
                .rateApplied(rate)
                .daysApplied((int) days)
                .periodFrom(periodFrom)
                .periodTo(periodTo)
                .source(source)
                .appliedByUserId(appliedByUserId)
                .build();

        charge = interestChargeRepository.save(charge);

        log.info("Interest applied: client={}, amount={}, days={}, rate={}%, period={} to {}, source={}",
                client.getId(), interest, days, rate, periodFrom, periodTo, source);

        return Optional.of(charge);
    }

    /**
     * Resolves the effective interest rate for a client.
     * Sub-accounts without their own rate configured inherit the parent's rate.
     */
    private BigDecimal resolveInterestRate(CreditClient client) {
        BigDecimal rate = client.getMonthlyInterestRate();
        if (rate != null && rate.compareTo(BigDecimal.ZERO) > 0) {
            return rate;
        }
        // Sub-account with no rate — inherit from parent
        if (client.getParentClientId() != null) {
            return clientRepository.findById(client.getParentClientId())
                    .map(CreditClient::getMonthlyInterestRate)
                    .filter(r -> r != null && r.compareTo(BigDecimal.ZERO) > 0)
                    .orElse(BigDecimal.ZERO);
        }
        return BigDecimal.ZERO;
    }

    /**
     * Calculates the start date of the next chargeable period for a client.
     *
     * Logic:
     * - If a previous charge exists: period_from = last_charge.period_to + 1 day
     * - Otherwise: period_from = oldest_credit_entry_date + grace_days
     *
     * Returns null if the client has no credit entries at all.
     */
    private LocalDate determinePeriodFrom(CreditClient client) {
        Optional<LocalDate> lastPeriodTo = interestChargeRepository.findLastPeriodToByClientId(client.getId());
        if (lastPeriodTo.isPresent()) {
            return lastPeriodTo.get().plusDays(1);
        }

        Optional<OffsetDateTime> oldestEntry = creditEntryRepository.findOldestEntryDateByClientId(client.getId());
        if (oldestEntry.isEmpty()) {
            return null;
        }

        // Bug 8 fix: convert to IST so the calendar date matches the business day
        int graceDays = client.getInterestGraceDays() != null ? client.getInterestGraceDays() : 1;
        return oldestEntry.get().atZoneSameInstant(ZoneId.of("Asia/Kolkata")).toLocalDate().plusDays(graceDays);
    }
}
