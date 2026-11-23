package com.ppms.report;

import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.common.time.DateRangeBounds;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class InventoryReportService {

    private static final int DEFAULT_REPORT_DAYS = 90;

    private final ShiftRepository shiftRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final UndergroundTankRepository undergroundTankRepository;
    private final BusinessClock businessClock;

    private record StockTotals(BigDecimal remaining, BigDecimal weightedAvgCost, BigDecimal stockValue) {}

    /** Every lot of a tank with its consumption history, for auditing FIFO deductions and cost accounting. */
    public InventoryLotsReport buildInventoryLotsReport(Long pumpId, Long tankId) {
        if (undergroundTankRepository.findByIdAndPumpId(tankId, pumpId).isEmpty()) {
            throw new ResourceNotFoundException(EntityType.TANK, "Tank not found");
        }
        List<InventoryLot> lots = inventoryLotRepository.findAllByTankIdOrdered(tankId);

        List<Long> lotIds = lots.stream().map(InventoryLot::getId).toList();
        List<LotConsumption> allConsumptions = lotIds.isEmpty()
                ? List.of()
                : lotConsumptionRepository.findByLotIdIn(lotIds);
        Map<Long, List<LotConsumption>> consumptionsByLot = allConsumptions.stream()
                .collect(Collectors.groupingBy(LotConsumption::getLotId));

        List<Long> shiftIds = allConsumptions.stream()
                .map(LotConsumption::getShiftId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        Map<Long, String> shiftNameById = shiftIds.isEmpty()
                ? Map.of()
                : shiftRepository.findAllById(shiftIds).stream()
                        .collect(Collectors.toMap(Shift::getId, s -> s.getShiftName() != null ? s.getShiftName() : ""));

        Map<Long, String> invoiceByDeliveryId = invoiceReferences(lots);
        List<InventoryLotsReport.LotLine> lines = lots.stream()
                .map(lot -> toLotLine(lot, consumptionsByLot, shiftNameById, invoiceByDeliveryId))
                .toList();

        StockTotals totals = stockTotals(lines);
        return new InventoryLotsReport(tankId, lots.size(), totals.remaining(), totals.weightedAvgCost(),
                totals.stockValue(), lines);
    }

    /** Active lots plus lots delivered in the range (default: the last 90 days), grouped by tank. */
    public AllTanksInventoryReport buildAllTanksInventoryReport(Long pumpId, LocalDate from, LocalDate to) {
        LocalDate fromDate = from != null ? from : businessClock.today().minusDays(DEFAULT_REPORT_DAYS);
        LocalDate toDate = to != null ? to : businessClock.today();
        DateRangeBounds.requireStartNotAfterEnd(fromDate, toDate);
        OffsetDateTime rangeStart = businessClock.startOfDay(fromDate);
        OffsetDateTime rangeEnd = businessClock.startOfDay(toDate.plusDays(1));
        List<InventoryLot> allLots = inventoryLotRepository.findReportLots(pumpId, rangeStart, rangeEnd);

        Set<Long> tankIds = allLots.stream().map(InventoryLot::getTankId).collect(Collectors.toSet());
        Map<Long, UndergroundTank> tankById = undergroundTankRepository.findAllById(tankIds).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, t -> t));
        Map<Long, String> invoiceByDeliveryId = invoiceReferences(allLots);

        Map<Long, List<LotConsumption>> consumptionsByLot = allLots.isEmpty()
                ? Map.of()
                : lotConsumptionRepository.findForReportLots(pumpId, rangeStart, rangeEnd).stream()
                        .collect(Collectors.groupingBy(LotConsumption::getLotId));
        Map<Long, String> shiftNameById = new HashMap<>();
        if (!consumptionsByLot.isEmpty()) {
            lotConsumptionRepository.findShiftNamesForReportLots(pumpId, rangeStart, rangeEnd)
                    .forEach(row -> shiftNameById.put((Long) row[0], row[1] != null ? (String) row[1] : ""));
        }

        Map<Long, List<InventoryLot>> lotsByTank = new LinkedHashMap<>();
        allLots.forEach(l -> lotsByTank.computeIfAbsent(l.getTankId(), k -> new ArrayList<>()).add(l));

        List<AllTanksInventoryReport.TankSection> sections = new ArrayList<>();
        lotsByTank.forEach((tankId, lots) -> {
            UndergroundTank tank = tankById.get(tankId);
            List<InventoryLotsReport.LotLine> lotLines = lots.stream()
                    .map(lot -> toLotLine(lot, consumptionsByLot, shiftNameById, invoiceByDeliveryId))
                    .toList();
            StockTotals totals = stockTotals(lotLines);
            sections.add(new AllTanksInventoryReport.TankSection(
                    tankId,
                    tank != null ? tank.getTankIdentifier() : "Tank " + tankId,
                    tank != null ? tank.getFuelType().name() : "UNKNOWN",
                    lots.size(), totals.remaining(), totals.weightedAvgCost(), totals.stockValue(), lotLines));
        });

        return new AllTanksInventoryReport(pumpId, sections, summariseByFuelType(sections));
    }

    private Map<Long, String> invoiceReferences(List<InventoryLot> lots) {
        Set<Long> deliveryIds = lots.stream()
                .map(InventoryLot::getTankerDeliveryId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        return deliveryIds.isEmpty()
                ? Map.of()
                : tankerDeliveryRepository.findAllById(deliveryIds).stream()
                        .collect(Collectors.toMap(TankerDelivery::getId, TankerDelivery::getInvoiceReference));
    }

    private InventoryLotsReport.LotLine toLotLine(InventoryLot lot,
                                                  Map<Long, List<LotConsumption>> consumptionsByLot,
                                                  Map<Long, String> shiftNameById,
                                                  Map<Long, String> invoiceByDeliveryId) {
        List<LotConsumption> consumptions = consumptionsByLot.getOrDefault(lot.getId(), List.of());
        BigDecimal totalConsumed = consumptions.stream()
                .map(LotConsumption::getQuantityConsumed)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCogs = consumptions.stream()
                .map(c -> c.getQuantityConsumed().multiply(c.getCostPricePerUnit()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        List<InventoryLotsReport.ConsumptionLine> consumptionLines = consumptions.stream()
                .map(c -> new InventoryLotsReport.ConsumptionLine(
                        c.getId(), c.getSourceType().name(), c.getShiftId(),
                        c.getShiftId() != null ? shiftNameById.get(c.getShiftId()) : null,
                        c.getQuantityConsumed(), c.getCostPricePerUnit(),
                        c.getQuantityConsumed().multiply(c.getCostPricePerUnit()).setScale(2, RoundingMode.HALF_UP),
                        c.getConsumedAt()))
                .toList();

        String tankerRef = lot.getIsDipAdjustment() || lot.getTankerDeliveryId() == null
                ? "DIP Adjustment"
                : invoiceByDeliveryId.getOrDefault(lot.getTankerDeliveryId(), "—");

        return new InventoryLotsReport.LotLine(
                lot.getId(), tankerRef, lot.getFuelType().name(), lot.getDeliveryDate(),
                lot.getOriginalQuantity(), lot.getRemainingQuantity(),
                totalConsumed.setScale(3, RoundingMode.HALF_UP),
                lot.getCostPricePerUnit(), totalCogs, lot.getStatus().name(),
                lot.getIsDipAdjustment(), consumptionLines);
    }

    private StockTotals stockTotals(List<InventoryLotsReport.LotLine> lines) {
        BigDecimal totalRemaining = lines.stream()
                .map(InventoryLotsReport.LotLine::remainingQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal value = lines.stream()
                .map(l -> l.remainingQuantity().multiply(l.costPricePerUnit()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal weightedAvgCost = totalRemaining.compareTo(BigDecimal.ZERO) == 0
                ? null
                : value.divide(totalRemaining, 2, RoundingMode.HALF_UP);
        return new StockTotals(totalRemaining, weightedAvgCost, value.setScale(2, RoundingMode.HALF_UP));
    }

    private List<AllTanksInventoryReport.CrossTankSummaryLine> summariseByFuelType(
            List<AllTanksInventoryReport.TankSection> sections) {
        Map<String, List<AllTanksInventoryReport.TankSection>> byFuelType = sections.stream()
                .collect(Collectors.groupingBy(AllTanksInventoryReport.TankSection::fuelType,
                        LinkedHashMap::new, Collectors.toList()));

        return byFuelType.entrySet().stream()
                .map(entry -> {
                    List<AllTanksInventoryReport.TankSection> tankSections = entry.getValue();
                    BigDecimal totalRemaining = tankSections.stream()
                            .map(AllTanksInventoryReport.TankSection::totalRemaining)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
                    BigDecimal value = tankSections.stream()
                            .map(s -> s.totalRemaining().multiply(
                                    s.weightedAvgCostPerUnit() != null ? s.weightedAvgCostPerUnit() : BigDecimal.ZERO))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal weightedAvgCost = totalRemaining.compareTo(BigDecimal.ZERO) == 0
                            ? null
                            : value.divide(totalRemaining, 2, RoundingMode.HALF_UP);
                    BigDecimal totalValue = tankSections.stream()
                            .map(AllTanksInventoryReport.TankSection::totalStockValue)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
                    return new AllTanksInventoryReport.CrossTankSummaryLine(
                            entry.getKey(), totalRemaining, weightedAvgCost, totalValue);
                })
                .toList();
    }
}
