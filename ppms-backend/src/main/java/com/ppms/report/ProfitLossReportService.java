package com.ppms.report;

import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import com.ppms.shift.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProfitLossReportService {

    private final ShiftRepository shiftRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final BusinessClock businessClock;

    private record CostOfGoods(Map<FuelType, BigDecimal> totalByFuel,
                               Map<FuelType, List<ProfitLossReport.LotCostLine>> lotLinesByFuel) {}

    /**
     * Revenue is units sold × price snapshot from closed shift readings; cost of goods is quantity
     * consumed × lot cost for those shifts, DIP adjustments included because they are real stock loss.
     */
    public ProfitLossReport buildProfitLossReport(Long pumpId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findClosedShiftsByDateRange(pumpId, from, to);
        List<Long> shiftIds = shifts.stream().map(Shift::getId).toList();

        List<ShiftFuelReading> readings = shiftIds.isEmpty()
                ? List.of()
                : fuelReadingRepository.findByShiftIdIn(shiftIds);
        List<LotConsumption> consumptions = shiftIds.isEmpty()
                ? List.of()
                : lotConsumptionRepository.findByShiftIdIn(shiftIds);

        Map<FuelType, BigDecimal> revenueByFuel = new EnumMap<>(FuelType.class);
        Map<FuelType, BigDecimal> unitsSoldByFuel = new EnumMap<>(FuelType.class);
        for (ShiftFuelReading reading : readings) {
            if (reading.getUnitsSold() == null) continue;
            BigDecimal revenue = reading.getUnitsSold().multiply(reading.getPriceSnapshot()).setScale(2, RoundingMode.HALF_UP);
            revenueByFuel.merge(reading.getFuelType(), revenue, BigDecimal::add);
            unitsSoldByFuel.merge(reading.getFuelType(), reading.getUnitsSold(), BigDecimal::add);
        }

        List<ProfitLossReport.FuelLine> lines = fuelLines(revenueByFuel, unitsSoldByFuel, costOfGoods(consumptions));
        BigDecimal totalRevenue = lines.stream().map(ProfitLossReport.FuelLine::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCogs = lines.stream().map(ProfitLossReport.FuelLine::cogs).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ProfitLossReport(pumpId, from, to, shifts.size(),
                totalRevenue.setScale(2, RoundingMode.HALF_UP),
                totalCogs.setScale(2, RoundingMode.HALF_UP),
                totalRevenue.subtract(totalCogs).setScale(2, RoundingMode.HALF_UP),
                total(shifts, Shift::getCashCollected), total(shifts, Shift::getUpiCollected),
                total(shifts, Shift::getCardCollected), total(shifts, Shift::getCreditTotal),
                lines);
    }

    private BigDecimal total(List<Shift> shifts, Function<Shift, BigDecimal> amount) {
        return shifts.stream()
                .map(amount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private CostOfGoods costOfGoods(List<LotConsumption> consumptions) {
        Set<Long> lotIds = consumptions.stream().map(LotConsumption::getLotId).collect(Collectors.toSet());
        List<InventoryLot> lots = lotIds.isEmpty() ? List.of() : inventoryLotRepository.findAllById(lotIds);
        Map<Long, InventoryLot> lotById = lots.stream().collect(Collectors.toMap(InventoryLot::getId, l -> l));

        Set<Long> deliveryIds = lots.stream()
                .map(InventoryLot::getTankerDeliveryId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, TankerDelivery> deliveryById = deliveryIds.isEmpty()
                ? Map.of()
                : tankerDeliveryRepository.findAllById(deliveryIds).stream()
                        .collect(Collectors.toMap(TankerDelivery::getId, d -> d));

        Map<FuelType, BigDecimal> totalByFuel = new EnumMap<>(FuelType.class);
        Map<FuelType, List<ProfitLossReport.LotCostLine>> lotLinesByFuel = new EnumMap<>(FuelType.class);
        for (LotConsumption consumption : consumptions) {
            InventoryLot lot = lotById.get(consumption.getLotId());
            if (lot == null) continue;

            BigDecimal cogs = consumption.getQuantityConsumed().multiply(consumption.getCostPricePerUnit())
                    .setScale(2, RoundingMode.HALF_UP);
            totalByFuel.merge(lot.getFuelType(), cogs, BigDecimal::add);

            String tankerRef;
            LocalDate deliveryDate;
            if (lot.getIsDipAdjustment() || lot.getTankerDeliveryId() == null) {
                tankerRef = "DIP Adjustment";
                deliveryDate = businessDateOf(lot.getDeliveryDate());
            } else {
                TankerDelivery delivery = deliveryById.get(lot.getTankerDeliveryId());
                tankerRef = delivery != null ? delivery.getInvoiceReference() : "—";
                deliveryDate = businessDateOf(delivery != null ? delivery.getDeliveryDate() : lot.getDeliveryDate());
            }

            lotLinesByFuel.computeIfAbsent(lot.getFuelType(), k -> new ArrayList<>())
                    .add(new ProfitLossReport.LotCostLine(
                            lot.getId(), tankerRef, deliveryDate,
                            consumption.getCostPricePerUnit(), consumption.getQuantityConsumed(), cogs));
        }
        return new CostOfGoods(totalByFuel, lotLinesByFuel);
    }

    private List<ProfitLossReport.FuelLine> fuelLines(Map<FuelType, BigDecimal> revenueByFuel,
                                                      Map<FuelType, BigDecimal> unitsSoldByFuel,
                                                      CostOfGoods costOfGoods) {
        List<ProfitLossReport.FuelLine> lines = new ArrayList<>();
        for (FuelType fuelType : FuelType.values()) {
            BigDecimal revenue = revenueByFuel.getOrDefault(fuelType, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal cogs = costOfGoods.totalByFuel().getOrDefault(fuelType, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            if (revenue.compareTo(BigDecimal.ZERO) == 0 && cogs.compareTo(BigDecimal.ZERO) == 0) continue;

            BigDecimal units = unitsSoldByFuel.getOrDefault(fuelType, BigDecimal.ZERO);
            BigDecimal marginPerUnit = units.compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : revenue.subtract(cogs).divide(units, 2, RoundingMode.HALF_UP);

            lines.add(new ProfitLossReport.FuelLine(fuelType.name(), revenue, cogs, revenue.subtract(cogs),
                    marginPerUnit, costOfGoods.lotLinesByFuel().getOrDefault(fuelType, List.of())));
        }
        return lines;
    }

    private LocalDate businessDateOf(OffsetDateTime moment) {
        return moment.atZoneSameInstant(businessClock.zone()).toLocalDate();
    }
}
