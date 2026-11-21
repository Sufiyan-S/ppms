package com.ppms.report;

import com.ppms.adjustment.FuelDipEntry;
import com.ppms.adjustment.FuelDipEntryRepository;
import com.ppms.inventory.DipCheck;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.shift.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/** Reads and sums everything a balance sheet is built from: sales, cost of goods, deliveries, dips and stock. */
@Slf4j
@Component
@RequiredArgsConstructor
class BalanceSheetInputsCollector {

    private final FuelDipEntryRepository fuelDipEntryRepository;
    private final ShiftFuelReadingRepository shiftFuelReadingRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final ShiftCreditEntryRepository shiftCreditEntryRepository;
    private final UndergroundTankRepository tankRepository;
    private final BalanceSheetSupportService supportService;
    record FuelSales(Map<FuelType, BigDecimal> litresByFuel,
                             Map<FuelType, BigDecimal> expectedRevenueByFuel,
                             Map<Long, List<ShiftFuelReading>> readingsByShift) {}

    record CostOfGoods(Map<FuelType, BigDecimal> byFuel, BigDecimal total) {}

    record Deliveries(Map<FuelType, BigDecimal> litresByFuel, Map<FuelType, BigDecimal> costByFuel) {
        static final Deliveries NONE = new Deliveries(Map.of(), Map.of());
    }

    record DipLosses(Map<FuelType, BigDecimal> litresByFuel, Map<FuelType, BigDecimal> amountByFuel,
                             BigDecimal totalAmount) {}

    /**
     * Litres sold and expected revenue per fuel type. Revenue uses each reading's price snapshot so it matches
     * the shifts' totalAmountDue even after a price change.
     */
    FuelSales sumFuelSales(List<Long> shiftIds) {
        List<ShiftFuelReading> readings = shiftFuelReadingRepository.findByShiftIdIn(shiftIds);
        Map<FuelType, BigDecimal> litresByFuel = new EnumMap<>(FuelType.class);
        Map<FuelType, BigDecimal> expectedRevByFuel = new EnumMap<>(FuelType.class);
        for (ShiftFuelReading r : readings) {
            BigDecimal units = r.getUnitsSold() != null ? r.getUnitsSold() : BigDecimal.ZERO;
            litresByFuel.merge(r.getFuelType(), units, BigDecimal::add);
            if (r.getPriceSnapshot() != null && units.compareTo(BigDecimal.ZERO) > 0) {
                expectedRevByFuel.merge(r.getFuelType(), units.multiply(r.getPriceSnapshot()), BigDecimal::add);
            }
        }
        return new FuelSales(litresByFuel, expectedRevByFuel,
                readings.stream().collect(Collectors.groupingBy(ShiftFuelReading::getShiftId)));
    }

    /** Exact cost of goods from the FIFO lot costs actually consumed by these shifts. */
    CostOfGoods sumCostOfGoods(List<Long> shiftIds) {
        List<LotConsumption> consumptions = lotConsumptionRepository.findByShiftIdIn(shiftIds);
        List<Long> consumedLotIds = consumptions.stream().map(LotConsumption::getLotId).distinct().toList();
        Map<Long, FuelType> lotFuelTypeById = consumedLotIds.isEmpty()
                ? Map.of()
                : inventoryLotRepository.findAllById(consumedLotIds).stream()
                        .collect(Collectors.toMap(InventoryLot::getId, InventoryLot::getFuelType));

        Map<FuelType, BigDecimal> cogsByFuel = new EnumMap<>(FuelType.class);
        BigDecimal total = BigDecimal.ZERO;
        for (LotConsumption c : consumptions) {
            FuelType ft = lotFuelTypeById.get(c.getLotId());
            if (ft == null) {
                log.warn("Lot consumption {} references missing lot {} — left out of COGS", c.getId(), c.getLotId());
                continue;
            }
            BigDecimal cost = c.getQuantityConsumed().multiply(c.getCostPricePerUnit());
            cogsByFuel.merge(ft, cost, BigDecimal::add);
            total = total.add(cost);
        }
        return new CostOfGoods(cogsByFuel, total.setScale(2, RoundingMode.HALF_UP));
    }

    Deliveries sumDeliveries(Long pumpId, ReportPeriod period) {
        Map<FuelType, BigDecimal> litresByFuel = new EnumMap<>(FuelType.class);
        Map<FuelType, BigDecimal> costByFuel = new EnumMap<>(FuelType.class);
        for (TankerDelivery d : tankerDeliveryRepository.findByPumpIdAndDeliveryDateGreaterThanEqualAndDeliveryDateLessThan(pumpId, period.start(), period.end())) {
            litresByFuel.merge(d.getFuelType(), d.getQuantityDelivered(), BigDecimal::add);
            costByFuel.merge(d.getFuelType(), d.getQuantityDelivered().multiply(d.getCostPricePerUnit()), BigDecimal::add);
        }
        return new Deliveries(litresByFuel, costByFuel);
    }

    /** Credit sold per fuel type; voided entries are cancelled sales and are left out. */
    Map<FuelType, BigDecimal> sumCreditSoldByFuel(List<Long> shiftIds) {
        Map<FuelType, BigDecimal> creditByFuel = new EnumMap<>(FuelType.class);
        for (ShiftCreditEntry entry : shiftCreditEntryRepository.findByShiftIdIn(shiftIds)) {
            if ("VOIDED".equals(entry.getVoidStatus())) continue;
            parseFuelType(entry.getFuelType(), "credit entry " + entry.getId()).ifPresent(ft ->
                    creditByFuel.merge(ft, entry.getAmount() != null ? entry.getAmount() : BigDecimal.ZERO, BigDecimal::add));
        }
        return creditByFuel;
    }

    DipLosses sumDipLosses(List<FuelDipEntry> dipEntries) {
        Map<FuelType, BigDecimal> litresByFuel = new EnumMap<>(FuelType.class);
        Map<FuelType, BigDecimal> amountByFuel = new EnumMap<>(FuelType.class);
        for (FuelDipEntry d : dipEntries) {
            parseFuelType(d.getFuelType(), "dip entry " + d.getId()).ifPresent(ft -> {
                litresByFuel.merge(ft, d.getLitresRemoved(), BigDecimal::add);
                amountByFuel.merge(ft, d.getMonetaryLoss(), BigDecimal::add);
            });
        }
        BigDecimal total = amountByFuel.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        return new DipLosses(litresByFuel, amountByFuel, total);
    }

    /** Net dipstick variance per fuel type: positive = more fuel found than the system expected. */
    static Map<FuelType, BigDecimal> sumDipCheckVariance(List<DipCheck> dipChecks, Map<Long, FuelType> tankFuelTypeMap) {
        Map<FuelType, BigDecimal> varianceByFuel = new EnumMap<>(FuelType.class);
        for (DipCheck dc : dipChecks) {
            FuelType ft = tankFuelTypeMap.get(dc.getTankId());
            if (ft == null) continue;
            varianceByFuel.merge(ft, dc.getMeasuredQuantity().subtract(dc.getSystemStock()), BigDecimal::add);
        }
        return varianceByFuel;
    }

    private Optional<FuelType> parseFuelType(String fuelType, String source) {
        if (fuelType == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(FuelType.valueOf(fuelType));
        } catch (IllegalArgumentException e) {
            log.warn("Unknown fuel type '{}' on {} — left out of the balance sheet", fuelType, source);
            return Optional.empty();
        }
    }

    Map<Long, FuelType> tankFuelTypesFor(Long pumpId) {
        return tankRepository.findByPumpId(pumpId).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, UndergroundTank::getFuelType, (a, b) -> a));
    }

    List<FuelDipEntry> dipEntriesFor(Long pumpId, ReportPeriod period) {
        return period.live()
                ? fuelDipEntryRepository.findByPumpIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                        pumpId, period.start(), period.end())
                : fuelDipEntryRepository.findByPumpIdAndDipDateBetween(pumpId, period.reportDate(), period.reportDate());
    }

    /** Litres held per fuel type at {@code asOf}: lots received before it minus what had been consumed by then. */
    private Map<FuelType, BigDecimal> stockByFuelTypeAt(Long pumpId, OffsetDateTime asOf) {
        return netStock(inventoryLotRepository.sumReceivedByFuelTypeBefore(pumpId, asOf),
                lotConsumptionRepository.sumConsumedByFuelTypeAsOf(pumpId, asOf));
    }

    /** Litres held per fuel type at the start of {@code day}, with shift sales attributed by shift date. */
    private Map<FuelType, BigDecimal> stockByFuelTypeBeforeDay(Long pumpId, LocalDate day) {
        OffsetDateTime dayStart = supportService.startOfBusinessDay(day);
        return netStock(inventoryLotRepository.sumReceivedByFuelTypeBefore(pumpId, dayStart),
                lotConsumptionRepository.sumConsumedByFuelTypeBeforeDay(pumpId, day, dayStart));
    }

    private static Map<FuelType, BigDecimal> netStock(List<Object[]> receivedRows, List<Object[]> consumedRows) {
        Map<FuelType, BigDecimal> stock = new EnumMap<>(FuelType.class);
        for (Object[] row : receivedRows) {
            stock.merge((FuelType) row[0], (BigDecimal) row[1], BigDecimal::add);
        }
        for (Object[] row : consumedRows) {
            stock.merge((FuelType) row[0], ((BigDecimal) row[1]).negate(), BigDecimal::add);
        }
        return stock;
    }

    record StockLevels(Map<FuelType, BigDecimal> openingByFuel, Map<FuelType, BigDecimal> closingByFuel) {}

    /**
     * Rebuilt from the lot ledger so historical reports show the stock of their own period, measured the
     * same way the report picks its shifts: SHIFT and live DAY by shift end time, historical DAY by shift
     * date. SHIFT reports span from the first included shift's start to the last one's end.
     */
    StockLevels stockLevels(Long pumpId, LocalDate reportDate, boolean isShift, boolean isLiveDay,
                            ReportPeriod period, List<Shift> shifts) {
        if (isShift) {
            OffsetDateTime stockFrom = shifts.stream().map(Shift::getActualStartTime).filter(Objects::nonNull)
                    .min(Comparator.naturalOrder()).orElse(period.start());
            OffsetDateTime stockTo = shifts.stream().map(Shift::getActualEndTime).filter(Objects::nonNull)
                    .max(Comparator.naturalOrder()).orElse(period.end());
            return new StockLevels(stockByFuelTypeAt(pumpId, stockFrom), stockByFuelTypeAt(pumpId, stockTo));
        }
        if (isLiveDay) {
            return new StockLevels(stockByFuelTypeAt(pumpId, period.start()), stockByFuelTypeAt(pumpId, period.end()));
        }
        return new StockLevels(stockByFuelTypeBeforeDay(pumpId, reportDate),
                stockByFuelTypeBeforeDay(pumpId, reportDate.plusDays(1)));
    }
}
