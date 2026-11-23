package com.ppms.adjustment;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.LotConsumptionSource;
import com.ppms.inventory.TankLotConsumptionService;
import com.ppms.pump.Nozzle;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.report.BalanceSheetStalenessService;
import com.ppms.report.StaleReasons;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class NozzleAdjustmentService {

    private final NozzleReadingAdjustmentRepository adjustmentRepository;
    private final FuelDipEntryRepository            dipEntryRepository;
    private final NozzleAdjustmentSupportService    supportService;
    private final BusinessClock businessClock;
    private final UndergroundTankRepository tankRepository;
    private final TankLotConsumptionService tankLotConsumptionService;
    private final LotConsumptionRepository lotConsumptionRepository;
    private final BalanceSheetStalenessService balanceSheetStalenessService;

    // ── Meter reading adjustment ──────────────────────────────────────────────

    /**
     * Records a meter reading adjustment (RESET or CUSTOM_READING) on a nozzle.
     *
     * Rules:
     * - Only allowed when the nozzle has no active shift (OPEN / OPEN_OVERDUE).
     *   An active shift uses the nozzle's lastReading as its start reading snapshot;
     *   changing it mid-shift would corrupt the units-sold calculation.
     * - RESET sets lastReading to 0 (meter physically reset to zero counter).
     * - CUSTOM_READING sets lastReading to the provided newReading value.
     *
     * No financial impact — this is purely an audit log + reading correction.
     */
    @Transactional
    public NozzleReadingAdjustment recordReadingAdjustment(
            Long pumpId, Long nozzleId, RecordAdjustmentRequest req, User currentUser) {

        Nozzle nozzle = supportService.requireAdjustableNozzle(pumpId, nozzleId);
        String type = supportService.validateAdjustmentType(req.getAdjustmentType());

        BigDecimal previousReading = nozzle.getLastReading();
        BigDecimal newReading = supportService.resolveNewReading(type, req.getNewReading());

        // Update the nozzle's lastReading — this becomes the start reading for the next shift
        nozzle.setLastReading(newReading);
        supportService.saveNozzle(nozzle);

        NozzleReadingAdjustment adjustment = NozzleReadingAdjustment.builder()
                .pumpId(pumpId)
                .nozzleId(nozzleId)
                .adjustmentType(type)
                .fuelType(nozzle.getFuelType().name())
                .previousReading(previousReading)
                .newReading(newReading)
                .reason(req.getReason().trim())
                .recordedByUserId(currentUser.getId())
                .build();

        NozzleReadingAdjustment saved = adjustmentRepository.save(adjustment);

        log.info("Meter reading adjusted: nozzle={}, type={}, {} → {}, by={}",
                nozzleId, type, previousReading, newReading, currentUser.getId());

        return saved;
    }

    public List<NozzleReadingAdjustment> getAdjustments(Long pumpId, Long nozzleId) {
        supportService.requireNozzleForPump(pumpId, nozzleId);
        return adjustmentRepository.findByNozzleIdOrderByCreatedAtDesc(nozzleId);
    }

    // ── Fuel dip entry ────────────────────────────────────────────────────────

    /**
     * Records a fuel dip entry — physical fuel removed from the tank for maintenance or testing.
     *
     * The litres leave the tank's stock and are drawn from its oldest lots, so a later dip check does not count
     * them as a loss again. The monetary loss is the purchase cost of those lots and is subtracted from gross
     * profit when generating balance sheets for the dip_date.
     *
     * Only today's drain can be recorded, since it reduces today's stock; no shift state dependency.
     */
    @Transactional
    public FuelDipEntry recordDip(Long pumpId, RecordDipRequest req, User currentUser) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(req.getTankId())
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));

        LocalDate dipDate = businessClock.today();
        if (req.getDipDate() != null && !req.getDipDate().equals(dipDate)) {
            throw new BusinessException(ErrorCodes.DRAIN_ONLY_TODAY,
                    Map.of("today", dipDate.toString(), "enteredDate", req.getDipDate().toString()),
                    "A drain can only be recorded for today (" + dipDate + "). It takes the fuel out of today's tank " +
                    "stock, so one dated " + req.getDipDate() + " would put the loss on the wrong day.");
        }

        BigDecimal litresRemoved = req.getLitresRemoved().setScale(3, RoundingMode.HALF_UP);
        BigDecimal stock = tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
        if (litresRemoved.compareTo(stock) > 0) {
            throw new BusinessException(ErrorCodes.DRAIN_EXCEEDS_TANK_STOCK, Map.of("tankName", tank.getTankIdentifier(),
                            "stock", stock.setScale(3, RoundingMode.HALF_UP).toPlainString(), "litresRemoved", litresRemoved.toPlainString()),
                    "Tank '" + tank.getTankIdentifier() + "' holds only " + stock.setScale(3, RoundingMode.HALF_UP) +
                    " L, so " + litresRemoved + " L cannot be removed from it.");
        }

        List<LotConsumption> draws = tankLotConsumptionService.consumeOldestFirst(
                tank, litresRemoved, LotConsumptionSource.MAINTENANCE_REMOVAL);
        BigDecimal lotCost = draws.stream()
                .map(draw -> draw.getQuantityConsumed().multiply(draw.getCostPricePerUnit()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal monetaryLoss = lotCost.setScale(2, RoundingMode.HALF_UP);
        BigDecimal costPerLitre = lotCost.divide(litresRemoved, 3, RoundingMode.HALF_UP);

        tank.setCurrentStock(stock.subtract(litresRemoved).setScale(3, RoundingMode.HALF_UP));
        tankRepository.save(tank);

        FuelDipEntry saved = dipEntryRepository.save(FuelDipEntry.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .fuelType(tank.getFuelType().name())
                .litresRemoved(litresRemoved)
                .pricePerUnit(costPerLitre)
                .monetaryLoss(monetaryLoss)
                .reason(req.getReason().trim())
                .dipDate(dipDate)
                .recordedByUserId(currentUser.getId())
                .build());
        draws.forEach(draw -> draw.setFuelDipEntryId(saved.getId()));
        lotConsumptionRepository.saveAll(draws);
        balanceSheetStalenessService.markAllSheetsStale(pumpId, List.of(dipDate),
                StaleReasons.drainRecorded(litresRemoved.toPlainString()));

        log.info("Fuel dip recorded: pump={}, tank={}, fuel={}, litres={}, loss={}, date={}, by={}",
                pumpId, tank.getId(), tank.getFuelType(), litresRemoved, monetaryLoss, dipDate, currentUser.getId());

        return saved;
    }

    public List<FuelDipEntry> getDips(Long pumpId) {
        return dipEntryRepository.findByPumpIdOrderByDipDateDescCreatedAtDesc(pumpId);
    }
}
