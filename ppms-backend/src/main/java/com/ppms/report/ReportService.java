package com.ppms.report;

import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.credit.CreditInterestCharge;
import com.ppms.credit.CreditInterestChargeRepository;
import com.ppms.expense.PumpExpense;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ShiftRepository shiftRepository;
    private final ShiftFuelReadingRepository fuelReadingRepository;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final UserRepository userRepository;
    private final PumpExpenseRepository expenseRepository;
    private final CreditInterestChargeRepository interestChargeRepository;
    private final CreditClientRepository creditClientRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final UndergroundTankRepository undergroundTankRepository;

    // ── P&L Report ────────────────────────────────────────────────────────────

    /**
     * Generates a profit-and-loss summary for a pump over the given date range.
     *
     * Revenue  = sum(unitsSold × priceSnapshot) from all closed shift readings.
     * COGS     = sum(quantityConsumed × costPricePerUnit) from lot consumptions for those shifts.
     * Gross P&L = Revenue − COGS.
     *
     * Both are broken down per fuel type for detailed analysis.
     * DIP-adjustment consumptions are included (they represent real stock reduction).
     */
    public ProfitLossReport buildProfitLossReport(Long pumpId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findClosedShiftsByDateRange(pumpId, from, to);
        List<Long> shiftIds = shifts.stream().map(Shift::getId).toList();

        // Revenue breakdown from shift payment fields
        BigDecimal totalCash   = shifts.stream().map(s -> s.getCashCollected()  != null ? s.getCashCollected()  : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalUpi    = shifts.stream().map(s -> s.getUpiCollected()   != null ? s.getUpiCollected()   : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalCard   = shifts.stream().map(s -> s.getCardCollected()  != null ? s.getCardCollected()  : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalCredit = shifts.stream().map(s -> s.getCreditTotal()    != null ? s.getCreditTotal()    : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);

        List<ShiftFuelReading> readings = shiftIds.isEmpty()
                ? List.of()
                : fuelReadingRepository.findByShiftIdIn(shiftIds);

        List<LotConsumption> consumptions = shiftIds.isEmpty()
                ? List.of()
                : lotConsumptionRepository.findByShiftIdIn(shiftIds);

        // Revenue + units sold per fuel type
        Map<FuelType, BigDecimal> revenueByFuel   = new LinkedHashMap<>();
        Map<FuelType, BigDecimal> unitsSoldByFuel = new LinkedHashMap<>();
        for (ShiftFuelReading r : readings) {
            if (r.getUnitsSold() == null) continue;
            BigDecimal revenue = r.getUnitsSold().multiply(r.getPriceSnapshot()).setScale(2, RoundingMode.HALF_UP);
            revenueByFuel.merge(r.getFuelType(), revenue, BigDecimal::add);
            unitsSoldByFuel.merge(r.getFuelType(), r.getUnitsSold(), BigDecimal::add);
        }

        // Batch-fetch lots to resolve fuelType, tankerDeliveryId, deliveryDate
        Set<Long> referencedLotIds = consumptions.stream().map(LotConsumption::getLotId).collect(Collectors.toSet());
        List<InventoryLot> referencedLots = referencedLotIds.isEmpty()
                ? List.of()
                : inventoryLotRepository.findAllById(referencedLotIds);
        Map<Long, InventoryLot> lotById = referencedLots.stream()
                .collect(Collectors.toMap(InventoryLot::getId, l -> l));

        // Batch-fetch tanker deliveries for invoice references
        Set<Long> deliveryIds = referencedLots.stream()
                .map(InventoryLot::getTankerDeliveryId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, TankerDelivery> deliveryById = deliveryIds.isEmpty()
                ? Map.of()
                : tankerDeliveryRepository.findAllById(deliveryIds).stream()
                        .collect(Collectors.toMap(TankerDelivery::getId, d -> d));

        // COGS + lot cost lines per fuel type
        Map<FuelType, BigDecimal>                         cogsByFuel     = new LinkedHashMap<>();
        Map<FuelType, List<ProfitLossReport.LotCostLine>> lotLinesByFuel = new LinkedHashMap<>();

        for (LotConsumption c : consumptions) {
            InventoryLot lot = lotById.get(c.getLotId());
            if (lot == null) continue;
            FuelType fuelType = lot.getFuelType();

            BigDecimal cogs = c.getQuantityConsumed().multiply(c.getCostPricePerUnit()).setScale(2, RoundingMode.HALF_UP);
            cogsByFuel.merge(fuelType, cogs, BigDecimal::add);

            String tankerRef;
            LocalDate deliveryDate;
            if (lot.getIsDipAdjustment() || lot.getTankerDeliveryId() == null) {
                tankerRef    = "DIP Adjustment";
                deliveryDate = lot.getDeliveryDate().toLocalDate();
            } else {
                TankerDelivery delivery = deliveryById.get(lot.getTankerDeliveryId());
                tankerRef    = delivery != null ? delivery.getInvoiceReference() : "—";
                deliveryDate = delivery != null ? delivery.getDeliveryDate().toLocalDate() : lot.getDeliveryDate().toLocalDate();
            }

            lotLinesByFuel.computeIfAbsent(fuelType, k -> new ArrayList<>())
                    .add(new ProfitLossReport.LotCostLine(
                            lot.getId(), tankerRef, deliveryDate,
                            c.getCostPricePerUnit(), c.getQuantityConsumed(), cogs));
        }

        // Build per-fuel lines
        List<ProfitLossReport.FuelLine> lines = new ArrayList<>();
        for (FuelType fuelType : FuelType.values()) {
            BigDecimal revenue = revenueByFuel.getOrDefault(fuelType, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal cogs    = cogsByFuel.getOrDefault(fuelType, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            if (revenue.compareTo(BigDecimal.ZERO) == 0 && cogs.compareTo(BigDecimal.ZERO) == 0) continue;

            BigDecimal units  = unitsSoldByFuel.getOrDefault(fuelType, BigDecimal.ZERO);
            BigDecimal margin = units.compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : revenue.subtract(cogs).divide(units, 2, RoundingMode.HALF_UP);

            List<ProfitLossReport.LotCostLine> lotCostLines = lotLinesByFuel.getOrDefault(fuelType, List.of());
            lines.add(new ProfitLossReport.FuelLine(fuelType.name(), revenue, cogs,
                    revenue.subtract(cogs), margin, lotCostLines));
        }

        BigDecimal totalRevenue = lines.stream().map(ProfitLossReport.FuelLine::revenue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCogs    = lines.stream().map(ProfitLossReport.FuelLine::cogs).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ProfitLossReport(pumpId, from, to, shifts.size(),
                totalRevenue.setScale(2, RoundingMode.HALF_UP),
                totalCogs.setScale(2, RoundingMode.HALF_UP),
                totalRevenue.subtract(totalCogs).setScale(2, RoundingMode.HALF_UP),
                totalCash, totalUpi, totalCard, totalCredit,
                lines);
    }

    // ── Operator Duty Report ──────────────────────────────────────────────────

    /**
     * Lists all shifts for a specific operator on a pump within the date range.
     * Includes a summary of totals across the period.
     */
    public OperatorDutyReport buildOperatorDutyReport(Long pumpId, Long operatorId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findByPumpIdAndOperatorIdAndDateRange(pumpId, operatorId, from, to);

        String operatorName = userRepository.findById(operatorId)
                .map(User::getFullName)
                .orElse("Unknown");

        List<OperatorDutyReport.ShiftLine> lines = shifts.stream().map(s -> new OperatorDutyReport.ShiftLine(
                s.getId(),
                s.getShiftDate(),
                s.getShiftName(),
                s.getActualStartTime(),
                s.getActualEndTime(),
                s.getTotalAmountDue() != null ? s.getTotalAmountDue() : BigDecimal.ZERO,
                s.getCashCollected() != null ? s.getCashCollected() : BigDecimal.ZERO,
                s.getUpiCollected() != null ? s.getUpiCollected() : BigDecimal.ZERO,
                s.getCardCollected() != null ? s.getCardCollected() : BigDecimal.ZERO,
                s.getCreditTotal() != null ? s.getCreditTotal() : BigDecimal.ZERO,
                s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO,
                s.getDiscrepancyType() != null ? s.getDiscrepancyType().name() : null,
                s.getStatus().name()
        )).toList();

        BigDecimal totalDue          = lines.stream().map(OperatorDutyReport.ShiftLine::totalAmountDue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalDiscrepancy  = lines.stream().map(OperatorDutyReport.ShiftLine::discrepancyAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new OperatorDutyReport(pumpId, operatorId, operatorName, from, to,
                lines.size(), totalDue.setScale(2, RoundingMode.HALF_UP),
                totalDiscrepancy.setScale(2, RoundingMode.HALF_UP), lines);
    }

    // ── Operator Discrepancy Report ───────────────────────────────────────────

    /**
     * Aggregates discrepancy shifts for all operators at a pump over the date range.
     * Only includes shifts that have a discrepancy (SHORT or OVER).
     * Grouped by operator for easy review.
     */
    public OperatorDiscrepancyReport buildOperatorDiscrepancyReport(Long pumpId, LocalDate from, LocalDate to) {
        List<Shift> shifts = shiftRepository.findClosedShiftsByDateRange(pumpId, from, to).stream()
                .filter(s -> s.getDiscrepancyType() != null)
                .toList();

        Map<Long, List<Shift>> byOperator = shifts.stream()
                .collect(Collectors.groupingBy(Shift::getOperatorId, LinkedHashMap::new, Collectors.toList()));

        Map<Long, String> nameCache = new LinkedHashMap<>();
        List<OperatorDiscrepancyReport.OperatorSummary> summaries = new ArrayList<>();

        for (Map.Entry<Long, List<Shift>> entry : byOperator.entrySet()) {
            Long opId = entry.getKey();
            String opName = nameCache.computeIfAbsent(opId, id ->
                    userRepository.findById(id).map(User::getFullName).orElse("Unknown"));

            List<Shift> opShifts = entry.getValue();
            BigDecimal totalShort = opShifts.stream()
                    .filter(s -> s.getDiscrepancyType() != null && s.getDiscrepancyType().name().equals("SHORT"))
                    .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalOver = opShifts.stream()
                    .filter(s -> s.getDiscrepancyType() != null && s.getDiscrepancyType().name().equals("OVER"))
                    .map(s -> s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            long unresolvedCount = opShifts.stream()
                    .filter(s -> s.getStatus() == ShiftStatus.CLOSED_DISCREPANCY_PENDING)
                    .count();

            List<OperatorDiscrepancyReport.DiscrepancyLine> lines = opShifts.stream()
                    .sorted(Comparator.comparing(Shift::getShiftDate))
                    .map(s -> new OperatorDiscrepancyReport.DiscrepancyLine(
                            s.getId(),
                            s.getShiftDate(),
                            s.getShiftName(),
                            s.getDiscrepancyType().name(),
                            s.getDiscrepancyAmount() != null ? s.getDiscrepancyAmount() : BigDecimal.ZERO,
                            s.getDiscrepancyReason(),
                            s.getStatus().name(),
                            s.getDiscrepancyResolution() != null ? s.getDiscrepancyResolution().name() : null
                    )).toList();

            summaries.add(new OperatorDiscrepancyReport.OperatorSummary(
                    opId, opName, opShifts.size(),
                    totalShort.setScale(2, RoundingMode.HALF_UP),
                    totalOver.setScale(2, RoundingMode.HALF_UP),
                    unresolvedCount, lines));
        }

        return new OperatorDiscrepancyReport(pumpId, from, to, shifts.size(), summaries);
    }

    // ── Inventory Lots Report ─────────────────────────────────────────────────

    /**
     * Lists all inventory lots for a tank with their consumption history.
     * Useful for auditing FIFO deductions and verifying cost accounting.
     */
    public InventoryLotsReport buildInventoryLotsReport(Long tankId) {
        List<InventoryLot> lots = inventoryLotRepository.findAllByTankIdOrdered(tankId);

        // Batch-fetch all consumptions for all lots in one query, then group by lotId
        List<Long> lotIds = lots.stream().map(InventoryLot::getId).toList();
        List<LotConsumption> allConsumptions = lotIds.isEmpty()
                ? List.of()
                : lotConsumptionRepository.findByLotIdIn(lotIds);
        Map<Long, List<LotConsumption>> consumptionsByLot = allConsumptions.stream()
                .collect(Collectors.groupingBy(LotConsumption::getLotId));

        // Batch-fetch shift names for all consumptions that reference a shift
        List<Long> shiftIds = allConsumptions.stream()
                .map(LotConsumption::getShiftId)
                .filter(id -> id != null)
                .distinct()
                .toList();
        Map<Long, String> shiftNameById = shiftIds.isEmpty()
                ? Map.of()
                : shiftRepository.findAllById(shiftIds).stream()
                        .collect(Collectors.toMap(Shift::getId, s -> s.getShiftName() != null ? s.getShiftName() : ""));

        // Batch-fetch tanker deliveries for invoice references
        Set<Long> deliveryIds = lots.stream()
                .map(InventoryLot::getTankerDeliveryId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, String> invoiceByDeliveryId = deliveryIds.isEmpty()
                ? Map.of()
                : tankerDeliveryRepository.findAllById(deliveryIds).stream()
                        .collect(Collectors.toMap(
                                TankerDelivery::getId,
                                TankerDelivery::getInvoiceReference));

        List<InventoryLotsReport.LotLine> lines = lots.stream().map(lot -> {
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
                            c.getShiftId() != null ? shiftNameById.getOrDefault(c.getShiftId(), null) : null,
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
        }).toList();

        BigDecimal totalRemaining = lines.stream()
                .map(InventoryLotsReport.LotLine::remainingQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal numerator = lines.stream()
                .map(l -> l.remainingQuantity().multiply(l.costPricePerUnit()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal weightedAvgCost = totalRemaining.compareTo(BigDecimal.ZERO) == 0
                ? null
                : numerator.divide(totalRemaining, 2, RoundingMode.HALF_UP);

        BigDecimal totalStockValue = numerator.setScale(2, RoundingMode.HALF_UP);

        return new InventoryLotsReport(tankId, lots.size(), totalRemaining, weightedAvgCost, totalStockValue, lines);
    }

    // ── All-Tanks Inventory Report ────────────────────────────────────────────

    public AllTanksInventoryReport buildAllTanksInventoryReport(Long pumpId) {
        List<InventoryLot> allLots = inventoryLotRepository.findAllByPumpIdOrderedByTankAndDelivery(pumpId);

        Set<Long> tankIds     = allLots.stream().map(InventoryLot::getTankId).collect(Collectors.toSet());
        Set<Long> deliveryIds = allLots.stream().map(InventoryLot::getTankerDeliveryId)
                .filter(id -> id != null).collect(Collectors.toSet());

        Map<Long, UndergroundTank> tankById = undergroundTankRepository.findAllById(tankIds).stream()
                .collect(Collectors.toMap(UndergroundTank::getId, t -> t));
        Map<Long, String> invoiceByDeliveryId = deliveryIds.isEmpty()
                ? Map.of()
                : tankerDeliveryRepository.findAllById(deliveryIds).stream()
                        .collect(Collectors.toMap(TankerDelivery::getId, TankerDelivery::getInvoiceReference));

        List<Long> lotIds = allLots.stream().map(InventoryLot::getId).toList();
        List<LotConsumption> allConsumptions = lotIds.isEmpty()
                ? List.of()
                : lotConsumptionRepository.findByLotIdIn(lotIds);
        Map<Long, List<LotConsumption>> consumptionsByLot = allConsumptions.stream()
                .collect(Collectors.groupingBy(LotConsumption::getLotId));

        List<Long> shiftIds = allConsumptions.stream().map(LotConsumption::getShiftId)
                .filter(id -> id != null).distinct().toList();
        Map<Long, String> shiftNameById = shiftIds.isEmpty()
                ? Map.of()
                : shiftRepository.findAllById(shiftIds).stream()
                        .collect(Collectors.toMap(Shift::getId, s -> s.getShiftName() != null ? s.getShiftName() : ""));

        Map<Long, List<InventoryLot>> lotsByTank = new LinkedHashMap<>();
        allLots.forEach(l -> lotsByTank.computeIfAbsent(l.getTankId(), k -> new ArrayList<>()).add(l));

        List<AllTanksInventoryReport.TankSection> sections = new ArrayList<>();
        for (Map.Entry<Long, List<InventoryLot>> entry : lotsByTank.entrySet()) {
            Long tankId = entry.getKey();
            List<InventoryLot> lots = entry.getValue();
            UndergroundTank tank = tankById.get(tankId);
            String identifier = tank != null ? tank.getTankIdentifier() : "Tank " + tankId;
            String fuelType   = tank != null ? tank.getFuelType().name() : "UNKNOWN";

            List<InventoryLotsReport.LotLine> lotLines = lots.stream().map(lot -> {
                List<LotConsumption> consumptions = consumptionsByLot.getOrDefault(lot.getId(), List.of());
                BigDecimal totalConsumed = consumptions.stream().map(LotConsumption::getQuantityConsumed)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal totalCogs = consumptions.stream()
                        .map(c -> c.getQuantityConsumed().multiply(c.getCostPricePerUnit()))
                        .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);

                String tankerRef = lot.getIsDipAdjustment() || lot.getTankerDeliveryId() == null
                        ? "DIP Adjustment"
                        : invoiceByDeliveryId.getOrDefault(lot.getTankerDeliveryId(), "—");

                List<InventoryLotsReport.ConsumptionLine> consumptionLines = consumptions.stream()
                        .map(c -> new InventoryLotsReport.ConsumptionLine(
                                c.getId(), c.getSourceType().name(), c.getShiftId(),
                                c.getShiftId() != null ? shiftNameById.getOrDefault(c.getShiftId(), null) : null,
                                c.getQuantityConsumed(), c.getCostPricePerUnit(),
                                c.getQuantityConsumed().multiply(c.getCostPricePerUnit()).setScale(2, RoundingMode.HALF_UP),
                                c.getConsumedAt()))
                        .toList();

                return new InventoryLotsReport.LotLine(
                        lot.getId(), tankerRef, lot.getFuelType().name(), lot.getDeliveryDate(),
                        lot.getOriginalQuantity(), lot.getRemainingQuantity(),
                        totalConsumed.setScale(3, RoundingMode.HALF_UP),
                        lot.getCostPricePerUnit(), totalCogs, lot.getStatus().name(),
                        lot.getIsDipAdjustment(), consumptionLines);
            }).toList();

            BigDecimal totalRemaining  = lotLines.stream().map(InventoryLotsReport.LotLine::remainingQuantity)
                    .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
            BigDecimal numerator       = lotLines.stream()
                    .map(l -> l.remainingQuantity().multiply(l.costPricePerUnit()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal weightedAvg     = totalRemaining.compareTo(BigDecimal.ZERO) == 0
                    ? null
                    : numerator.divide(totalRemaining, 2, RoundingMode.HALF_UP);
            BigDecimal totalStockValue = numerator.setScale(2, RoundingMode.HALF_UP);

            sections.add(new AllTanksInventoryReport.TankSection(
                    tankId, identifier, fuelType, lots.size(),
                    totalRemaining, weightedAvg, totalStockValue, lotLines));
        }

        Map<String, List<AllTanksInventoryReport.TankSection>> byFuelType = sections.stream()
                .collect(Collectors.groupingBy(AllTanksInventoryReport.TankSection::fuelType,
                        LinkedHashMap::new, Collectors.toList()));

        List<AllTanksInventoryReport.CrossTankSummaryLine> crossSummary = byFuelType.entrySet().stream()
                .map(entry -> {
                    List<AllTanksInventoryReport.TankSection> tankSections = entry.getValue();
                    BigDecimal totalRem = tankSections.stream().map(AllTanksInventoryReport.TankSection::totalRemaining)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
                    BigDecimal num = tankSections.stream()
                            .map(s -> s.totalRemaining().multiply(
                                    s.weightedAvgCostPerUnit() != null ? s.weightedAvgCostPerUnit() : BigDecimal.ZERO))
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal wtdAvg  = totalRem.compareTo(BigDecimal.ZERO) == 0
                            ? null
                            : num.divide(totalRem, 2, RoundingMode.HALF_UP);
                    BigDecimal totalVal = tankSections.stream().map(AllTanksInventoryReport.TankSection::totalStockValue)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
                    return new AllTanksInventoryReport.CrossTankSummaryLine(entry.getKey(), totalRem, wtdAvg, totalVal);
                })
                .toList();

        return new AllTanksInventoryReport(pumpId, sections, crossSummary);
    }

    public List<ReportController.ShiftReportLine> buildShiftReportLines(Long pumpId, LocalDate from, LocalDate to) {
        return shiftRepository.findClosedShiftsByDateRange(pumpId, from, to).stream()
                .map(shift -> new ReportController.ShiftReportLine(
                        shift.getId(),
                        shift.getShiftDate(),
                        shift.getShiftName(),
                        shift.getStatus() != null ? shift.getStatus().name() : null,
                        shift.getTotalAmountDue(),
                        shift.getCashCollected(),
                        shift.getUpiCollected(),
                        shift.getCardCollected(),
                        shift.getCreditTotal(),
                        shift.getDiscrepancyAmount(),
                        shift.getDiscrepancyType() != null ? shift.getDiscrepancyType().name() : null
                ))
                .toList();
    }

    public List<ReportController.ExpenseReportLine> buildExpenseReportLines(Long pumpId, LocalDate from, LocalDate to) {
        return expenseRepository.findByPumpIdOrderByExpenseDateDescCreatedAtDesc(pumpId).stream()
                .filter(expense -> !expense.getExpenseDate().isBefore(from) && !expense.getExpenseDate().isAfter(to))
                .map(expense -> new ReportController.ExpenseReportLine(
                        expense.getId(),
                        expense.getExpenseDate(),
                        expense.getCategory() != null ? expense.getCategory().name() : null,
                        expense.getAmount(),
                        expense.getDescription(),
                        expense.getApprovalStatus() != null ? expense.getApprovalStatus().name() : null
                ))
                .toList();
    }

    // ── Interest Accrual Report ───────────────────────────────────────────────

    /**
     * Builds the Interest Accrual Report for a pump over a date range.
     *
     * Lists all interest charges whose period_from falls within [from, to], grouped by client.
     * Each client line shows: client name, number of charges, total interest accrued.
     * The report total is the sum across all clients.
     *
     * Client names are batch-loaded to avoid N+1 queries.
     */
    public InterestAccrualReport buildInterestAccrualReport(Long pumpId, LocalDate from, LocalDate to) {
        List<CreditInterestCharge> charges = interestChargeRepository.findByPumpIdAndPeriodFromBetween(pumpId, from, to);

        // Batch-load client names — one query instead of one per charge
        Set<Long> clientIds = charges.stream().map(CreditInterestCharge::getClientId).collect(Collectors.toSet());
        Map<Long, String> clientNames = creditClientRepository.findAllById(clientIds).stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        // Group by client and build per-client lines
        Map<Long, List<CreditInterestCharge>> byClient = charges.stream()
                .collect(Collectors.groupingBy(CreditInterestCharge::getClientId, LinkedHashMap::new, Collectors.toList()));

        List<InterestAccrualReport.ClientLine> clientLines = byClient.entrySet().stream()
                .map(entry -> {
                    Long clientId = entry.getKey();
                    List<CreditInterestCharge> clientCharges = entry.getValue();
                    BigDecimal totalInterest = clientCharges.stream()
                            .map(CreditInterestCharge::getAmount)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                            .setScale(2, RoundingMode.HALF_UP);
                    List<InterestAccrualReport.ChargeLine> chargeLines = clientCharges.stream()
                            .map(c -> new InterestAccrualReport.ChargeLine(
                                    c.getId(), c.getPeriodFrom(), c.getPeriodTo(),
                                    c.getOutstandingBalance(), c.getRateApplied(),
                                    c.getDaysApplied(), c.getAmount(), c.getSource()))
                            .toList();
                    return new InterestAccrualReport.ClientLine(
                            clientId, clientNames.getOrDefault(clientId, "Unknown"),
                            clientCharges.size(), totalInterest, chargeLines);
                })
                .toList();

        BigDecimal totalInterest = clientLines.stream()
                .map(InterestAccrualReport.ClientLine::totalInterest)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        return new InterestAccrualReport(pumpId, from, to, charges.size(), totalInterest, clientLines);
    }

    // ── Response types ────────────────────────────────────────────────────────

    public record ProfitLossReport(
            Long pumpId,
            LocalDate from,
            LocalDate to,
            int totalShifts,
            BigDecimal totalRevenue,
            BigDecimal totalCogs,
            BigDecimal grossProfit,
            BigDecimal totalCashRevenue,
            BigDecimal totalUpiRevenue,
            BigDecimal totalCardRevenue,
            BigDecimal totalCreditRevenue,
            List<FuelLine> byFuelType) {

        public record FuelLine(
                String fuelType,
                BigDecimal revenue,
                BigDecimal cogs,
                BigDecimal grossProfit,
                BigDecimal grossMarginPerLitre,    // null when totalUnitsSold == 0
                List<LotCostLine> lotCostLines) {}

        public record LotCostLine(
                Long lotId,
                String tankerReference,
                LocalDate deliveryDate,
                BigDecimal costPricePerUnit,
                BigDecimal quantityConsumed,
                BigDecimal lotCost) {}
    }

    public record OperatorDutyReport(
            Long pumpId,
            Long operatorId,
            String operatorName,
            LocalDate from,
            LocalDate to,
            int totalShifts,
            BigDecimal totalAmountDue,
            BigDecimal totalDiscrepancy,
            List<ShiftLine> shifts) {

        public record ShiftLine(
                Long shiftId,
                LocalDate shiftDate,
                String shiftWindow,
                java.time.OffsetDateTime actualStartTime,
                java.time.OffsetDateTime actualEndTime,
                BigDecimal totalAmountDue,
                BigDecimal cashCollected,
                BigDecimal upiCollected,
                BigDecimal cardCollected,
                BigDecimal creditTotal,
                BigDecimal discrepancyAmount,
                String discrepancyType,
                String status) {}
    }

    public record OperatorDiscrepancyReport(
            Long pumpId,
            LocalDate from,
            LocalDate to,
            int totalDiscrepancyShifts,
            List<OperatorSummary> operators) {

        public record OperatorSummary(
                Long operatorId,
                String operatorName,
                int discrepancyShiftCount,
                BigDecimal totalShortAmount,
                BigDecimal totalOverAmount,
                long unresolvedCount,
                List<DiscrepancyLine> shifts) {}

        public record DiscrepancyLine(
                Long shiftId,
                LocalDate shiftDate,
                String shiftWindow,
                String discrepancyType,
                BigDecimal discrepancyAmount,
                String discrepancyReason,
                String status,
                String resolution) {}
    }

    public record InventoryLotsReport(
            Long tankId,
            int totalLots,
            BigDecimal totalRemaining,
            BigDecimal weightedAvgCostPerUnit,   // null when totalRemaining == 0
            BigDecimal totalStockValue,
            List<LotLine> lots) {

        public record LotLine(
                Long lotId,
                String tankerReference,
                String fuelType,
                java.time.OffsetDateTime deliveryDate,
                BigDecimal originalQuantity,
                BigDecimal remainingQuantity,
                BigDecimal totalConsumed,
                BigDecimal costPricePerUnit,
                BigDecimal totalCogsConsumed,
                String status,
                Boolean isDipAdjustment,
                List<ConsumptionLine> consumptions) {}

        public record ConsumptionLine(
                Long id,
                String sourceType,
                Long shiftId,
                String shiftName,
                BigDecimal quantityConsumed,
                BigDecimal costPricePerUnit,
                BigDecimal totalCost,
                java.time.OffsetDateTime consumedAt) {}
    }

    public record InterestAccrualReport(
            Long pumpId,
            LocalDate from,
            LocalDate to,
            int totalCharges,
            BigDecimal totalInterest,
            List<ClientLine> clients) {

        public record ClientLine(
                Long clientId,
                String clientName,
                int chargeCount,
                BigDecimal totalInterest,
                List<ChargeLine> charges) {}

        public record ChargeLine(
                Long id,
                LocalDate periodFrom,
                LocalDate periodTo,
                BigDecimal outstandingBalance,
                BigDecimal rateApplied,
                Integer daysApplied,
                BigDecimal amount,
                String source) {}
    }

    public record AllTanksInventoryReport(
            Long pumpId,
            List<TankSection> tanks,
            List<CrossTankSummaryLine> crossTankSummary) {

        public record TankSection(
                Long tankId,
                String tankIdentifier,
                String fuelType,
                int lotCount,
                BigDecimal totalRemaining,
                BigDecimal weightedAvgCostPerUnit,   // null when totalRemaining == 0
                BigDecimal totalStockValue,
                List<InventoryLotsReport.LotLine> lots) {}

        public record CrossTankSummaryLine(
                String fuelType,
                BigDecimal totalRemaining,
                BigDecimal weightedAvgCostPerUnit,
                BigDecimal totalStockValue) {}
    }
}
