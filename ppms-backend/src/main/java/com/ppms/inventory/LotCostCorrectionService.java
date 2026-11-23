package com.ppms.inventory;

import com.ppms.adjustment.FuelDipEntry;
import com.ppms.adjustment.FuelDipEntryRepository;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.time.BusinessClock;
import com.ppms.report.BalanceSheetStalenessService;
import com.ppms.report.StaleReasons;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Applies a corrected purchase cost to fuel already drawn from a lot, so sold, drained and dip-corrected litres
 * carry the cost the fuel was really bought at. Balance sheets of the days that used the lot are marked stale.
 */
@Slf4j
@Service
@Transactional(propagation = Propagation.MANDATORY)
@RequiredArgsConstructor
public class LotCostCorrectionService {

    private final LotConsumptionRepository lotConsumptionRepository;
    private final FuelDipEntryRepository fuelDipEntryRepository;
    private final ShiftRepository shiftRepository;
    private final DipCheckRepository dipCheckRepository;
    private final BalanceSheetStalenessService balanceSheetStalenessService;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    public void recostConsumedFuel(Long pumpId, InventoryLot lot, BigDecimal oldCost, BigDecimal newCost,
                                   TankerDelivery delivery, User currentUser) {
        List<LotConsumption> consumptions = lotConsumptionRepository.findByLotId(lot.getId());
        consumptions.forEach(consumption -> consumption.setCostPricePerUnit(newCost));
        lotConsumptionRepository.saveAll(consumptions);

        Set<LocalDate> affectedDates = new HashSet<>();
        affectedDates.addAll(shiftDatesOf(consumptions));
        affectedDates.addAll(dipCheckDatesOf(consumptions));
        affectedDates.addAll(recostDrains(consumptions));

        BigDecimal litresRecosted = consumptions.stream()
                .map(LotConsumption::getQuantityConsumed)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(3, RoundingMode.HALF_UP);
        String costChange = "₹" + perLitre(oldCost) + " → ₹" + perLitre(newCost) + "/L";
        balanceSheetStalenessService.markAllSheetsStale(pumpId, affectedDates, StaleReasons.fuelCostCorrected(
                delivery.getFuelType(), delivery.getInvoiceReference(), perLitre(oldCost), perLitre(newCost)));

        log.info("Fuel lot re-costed: pump={}, lot={}, delivery={}, cost {} -> {}, litresRecosted={}, days={}",
                pumpId, lot.getId(), delivery.getId(), oldCost, newCost, litresRecosted, affectedDates.size());
        auditService.log(pumpId, AuditAction.LOT_COST_CORRECTED, "TankerDelivery", delivery.getId().toString(),
                "Cost of " + delivery.getFuelType() + " delivery (invoice " + delivery.getInvoiceReference() + ") corrected " +
                costChange + "; " + litresRecosted + " L already used re-costed",
                currentUser);
    }

    /** Fuel costs are stored per litre to 3 decimals. */
    private static String perLitre(BigDecimal cost) {
        return cost.setScale(3, RoundingMode.HALF_UP).toPlainString();
    }

    private Set<LocalDate> shiftDatesOf(List<LotConsumption> consumptions) {
        Set<Long> shiftIds = consumptions.stream().map(LotConsumption::getShiftId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        return shiftRepository.findAllById(shiftIds).stream().map(Shift::getShiftDate).collect(Collectors.toSet());
    }

    private Set<LocalDate> dipCheckDatesOf(List<LotConsumption> consumptions) {
        Set<Long> dipCheckIds = consumptions.stream().map(LotConsumption::getDipCorrectionId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        return dipCheckRepository.findAllById(dipCheckIds).stream()
                .map(check -> check.getCheckedAt().atZoneSameInstant(businessClock.zone()).toLocalDate())
                .collect(Collectors.toSet());
    }

    /** A drain stores its loss at the time it was recorded, so its loss is recomputed from its re-costed draws. */
    private Set<LocalDate> recostDrains(List<LotConsumption> consumptions) {
        Set<Long> drainIds = consumptions.stream().map(LotConsumption::getFuelDipEntryId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        if (drainIds.isEmpty()) {
            return Set.of();
        }
        List<LotConsumption> drainDraws = lotConsumptionRepository.findByFuelDipEntryIdIn(drainIds);
        List<FuelDipEntry> drains = fuelDipEntryRepository.findAllById(drainIds);
        for (FuelDipEntry drain : drains) {
            BigDecimal drawCost = drainDraws.stream()
                    .filter(draw -> drain.getId().equals(draw.getFuelDipEntryId()))
                    .map(draw -> draw.getQuantityConsumed().multiply(draw.getCostPricePerUnit()))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            drain.setMonetaryLoss(drawCost.setScale(2, RoundingMode.HALF_UP));
            drain.setPricePerUnit(drawCost.divide(drain.getLitresRemoved(), 3, RoundingMode.HALF_UP));
        }
        fuelDipEntryRepository.saveAll(drains);
        return drains.stream().map(FuelDipEntry::getDipDate).collect(Collectors.toSet());
    }
}
