package com.ppms.credit;

import com.ppms.common.time.BusinessClock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Runs interest for many client groups, each in its own transaction (see
 * {@link CreditInterestService#applyToClientGroupInNewTransaction}), so one failing group is
 * logged and reported without losing the charges of the others.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditInterestRunService {

    private final CreditClientRepository clientRepository;
    private final CreditInterestService interestService;
    private final BusinessClock businessClock;

    /**
     * @param groupsCharged   root clients whose group received at least one charge
     * @param groupsSkipped   root clients whose group was not eligible (no balance, grace period, no rate)
     * @param failedClientIds root clients whose group failed and was rolled back
     */
    public record InterestRunResult(int groupsCharged, int groupsSkipped, List<Long> failedClientIds) {
        public int groupsFailed() {
            return failedClientIds.size();
        }
    }

    public InterestRunResult applyProRataForAllClients(Long pumpId, Long appliedByUserId) {
        List<Long> rootClientIds = rootIds(clientRepository.findByPumpIdOrderByNameAsc(pumpId));
        InterestRunResult result = applyToGroups(rootClientIds, businessClock.today(), "MANUAL", appliedByUserId);
        log.info("Pro-rata interest applied for pump={}: charged={}, skipped={}, failed={}/{}",
                pumpId, result.groupsCharged(), result.groupsSkipped(), result.groupsFailed(), rootClientIds.size());
        return result;
    }

    public InterestRunResult applyInterestForPeriod(InterestPeriod period, LocalDate periodTo, String source) {
        List<Long> rootClientIds = rootIds(clientRepository.findByInterestPeriod(period));
        InterestRunResult result = applyToGroups(rootClientIds, periodTo, source, null);
        log.info("Interest staged: period={}, source={}, charged={}, skipped={}, failed={}/{}",
                period, source, result.groupsCharged(), result.groupsSkipped(), result.groupsFailed(), rootClientIds.size());
        return result;
    }

    private InterestRunResult applyToGroups(List<Long> rootClientIds, LocalDate periodTo, String source, Long appliedByUserId) {
        int charged = 0;
        int skipped = 0;
        List<Long> failedClientIds = new ArrayList<>();
        for (Long rootClientId : rootClientIds) {
            try {
                if (interestService.applyToClientGroupInNewTransaction(rootClientId, periodTo, source, appliedByUserId) > 0) {
                    charged++;
                } else {
                    skipped++;
                }
            } catch (RuntimeException e) {
                log.error("Interest failed for client group root={} source={} periodTo={}: {}",
                        rootClientId, source, periodTo, e.getMessage(), e);
                failedClientIds.add(rootClientId);
            }
        }
        return new InterestRunResult(charged, skipped, failedClientIds);
    }

    private static List<Long> rootIds(List<CreditClient> clients) {
        return clients.stream()
                .filter(client -> client.getParentClientId() == null)
                .map(CreditClient::getId)
                .toList();
    }
}
