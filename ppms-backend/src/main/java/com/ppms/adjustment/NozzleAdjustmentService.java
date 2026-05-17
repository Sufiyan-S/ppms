package com.ppms.adjustment;

import com.ppms.fuel.FuelType;
import com.ppms.pump.Nozzle;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NozzleAdjustmentService {

    private final NozzleReadingAdjustmentRepository adjustmentRepository;
    private final FuelDipEntryRepository            dipEntryRepository;
    private final NozzleAdjustmentSupportService    supportService;

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
     * The monetary loss is calculated as: litresRemoved × current fuel price (snapshotted at creation time).
     * This loss is subtracted from gross profit when generating balance sheets for the dip_date.
     *
     * Can be recorded at any time (no shift state dependency) by Admin/Owner.
     */
    @Transactional
    public FuelDipEntry recordDip(Long pumpId, RecordDipRequest req, User currentUser) {
        FuelType fuelType = supportService.parseFuelType(req.getFuelType());

        // Snapshot current price at the time of recording for historical accuracy
        BigDecimal pricePerUnit = supportService.requireCurrentPrice(pumpId, fuelType);

        BigDecimal litresRemoved = req.getLitresRemoved().setScale(3, RoundingMode.HALF_UP);
        BigDecimal monetaryLoss  = litresRemoved.multiply(pricePerUnit).setScale(2, RoundingMode.HALF_UP);
        LocalDate  dipDate       = req.getDipDate() != null ? req.getDipDate() : LocalDate.now();

        FuelDipEntry entry = FuelDipEntry.builder()
                .pumpId(pumpId)
                .fuelType(fuelType.name())
                .litresRemoved(litresRemoved)
                .pricePerUnit(pricePerUnit)
                .monetaryLoss(monetaryLoss)
                .reason(req.getReason().trim())
                .dipDate(dipDate)
                .recordedByUserId(currentUser.getId())
                .build();

        FuelDipEntry saved = dipEntryRepository.save(entry);

        log.info("Fuel dip recorded: pump={}, fuel={}, litres={}, loss={}, date={}, by={}",
                pumpId, fuelType, litresRemoved, monetaryLoss, dipDate, currentUser.getId());

        return saved;
    }

    public List<FuelDipEntry> getDips(Long pumpId) {
        return dipEntryRepository.findByPumpIdOrderByDipDateDescCreatedAtDesc(pumpId);
    }
}
