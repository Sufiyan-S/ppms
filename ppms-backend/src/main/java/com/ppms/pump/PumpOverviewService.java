package com.ppms.pump;

import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.inventory.InventoryResponseAssembler;
import com.ppms.inventory.TankStockResponse;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Today's figures for all of a user's pumps at once. Each figure is worked out the same way the
 * single-pump overview works it out, and each is loaded with one query covering every pump.
 */
@Service
@RequiredArgsConstructor
public class PumpOverviewService {

    private final PumpService pumpService;
    private final ShiftRepository shiftRepository;
    private final UndergroundTankRepository tankRepository;
    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final InventoryResponseAssembler inventoryResponseAssembler;
    private final BusinessClock businessClock;

    @Transactional(readOnly = true)
    public PumpOverviewResponse getOverview(User currentUser) {
        List<PumpLocation> pumps = pumpService.findMyPumps(currentUser);
        if (pumps.isEmpty()) {
            return new PumpOverviewResponse(List.of(), totalsOf(List.of()));
        }
        List<Long> pumpIds = pumps.stream().map(PumpLocation::getId).toList();
        LocalDate today = businessClock.today();

        Map<Long, BigDecimal> salesByPump = todaySalesByPump(pumpIds, today);
        Map<Long, Map<ShiftStatus, Long>> openShiftsByPump = openShiftCountsByPump(pumpIds);
        Map<Long, Long> lowStockTanksByPump = lowStockTankCountByPump(pumpIds);
        Map<Long, List<GlobalFuelPrice>> pricesByPump = fuelPriceRepository.findCurrentPricesForPumps(pumpIds).stream()
                .collect(Collectors.groupingBy(GlobalFuelPrice::getPumpId));

        List<PumpOverviewSummary> summaries = pumps.stream()
                .map(pump -> {
                    Map<ShiftStatus, Long> openShifts = openShiftsByPump.getOrDefault(pump.getId(), Map.of());
                    return new PumpOverviewSummary(
                            pump.getId(),
                            pump.getName(),
                            pump.isEnabled(),
                            salesByPump.getOrDefault(pump.getId(), BigDecimal.ZERO),
                            openShifts.values().stream().mapToLong(Long::longValue).sum(),
                            openShifts.getOrDefault(ShiftStatus.OPEN_OVERDUE, 0L),
                            lowStockTanksByPump.getOrDefault(pump.getId(), 0L),
                            arePricesStale(pricesByPump.getOrDefault(pump.getId(), List.of()), today));
                })
                .toList();
        return new PumpOverviewResponse(summaries, totalsOf(summaries));
    }

    private Map<Long, BigDecimal> todaySalesByPump(List<Long> pumpIds, LocalDate today) {
        Map<Long, BigDecimal> salesByPump = new HashMap<>();
        for (Object[] row : shiftRepository.sumAmountDueByPumpForDate(pumpIds, today)) {
            salesByPump.put((Long) row[0], (BigDecimal) row[1]);
        }
        return salesByPump;
    }

    private Map<Long, Map<ShiftStatus, Long>> openShiftCountsByPump(List<Long> pumpIds) {
        Map<Long, Map<ShiftStatus, Long>> countsByPump = new HashMap<>();
        for (Object[] row : shiftRepository.countOpenShiftsByPumpAndStatus(pumpIds)) {
            countsByPump.computeIfAbsent((Long) row[0], pumpId -> new HashMap<>())
                    .put((ShiftStatus) row[1], (Long) row[2]);
        }
        return countsByPump;
    }

    private Map<Long, Long> lowStockTankCountByPump(List<Long> pumpIds) {
        return tankRepository.findByPumpIdIn(pumpIds).stream()
                .filter(tank -> tank.getStatus() != TankStatus.DECOMMISSIONED)
                .map(inventoryResponseAssembler::toTankStockResponse)
                .filter(TankStockResponse::isLowStock)
                .collect(Collectors.groupingBy(TankStockResponse::getPumpId, Collectors.counting()));
    }

    // Matches isPriceStale on the overview page, which is stricter than the PRICE_STALE notification.
    private boolean arePricesStale(List<GlobalFuelPrice> currentPrices, LocalDate today) {
        return currentPrices.isEmpty() || currentPrices.stream()
                .anyMatch(price -> price.getEffectiveFrom()
                        .atZoneSameInstant(businessClock.zone())
                        .toLocalDate()
                        .isBefore(today));
    }

    private PumpOverviewTotals totalsOf(List<PumpOverviewSummary> summaries) {
        return new PumpOverviewTotals(
                summaries.stream().map(PumpOverviewSummary::todaySales).reduce(BigDecimal.ZERO, BigDecimal::add),
                summaries.stream().mapToLong(PumpOverviewSummary::openShiftCount).sum(),
                summaries.stream().mapToLong(PumpOverviewSummary::overdueShiftCount).sum(),
                summaries.stream().mapToLong(PumpOverviewSummary::lowStockTankCount).sum(),
                summaries.stream().filter(PumpOverviewSummary::fuelPricesStale).count());
    }
}
