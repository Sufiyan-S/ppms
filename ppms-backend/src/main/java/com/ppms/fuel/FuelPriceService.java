package com.ppms.fuel;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.notification.NotificationDedupService;
import com.ppms.notification.NotificationType;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class FuelPriceService {

    private static final BigDecimal MAX_UNCONFIRMED_DEVIATION_PERCENT = new BigDecimal("15");

    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;
    private final NotificationDedupService notificationDedupService;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;
    private final BusinessClock businessClock;

    @Transactional(readOnly = true)
    public List<GlobalFuelPrice> getCurrentPrices(Long pumpId) {
        return fuelPriceRepository.findCurrentPricesForPump(pumpId);
    }

    /**
     * With a shift definition the price is the one in force when that shift started, matching what
     * backfill charges; without one it is the price at the end of the day.
     */
    @Transactional(readOnly = true)
    public List<FuelPriceForDateResponse> getPricesForDate(Long pumpId, LocalDate date, Long shiftDefinitionId) {
        ZoneId zone = businessClock.zone();
        OffsetDateTime asOf = shiftDefinitionId == null
                ? date.plusDays(1).atStartOfDay(zone).toOffsetDateTime()
                : shiftDefinitionRepository.findByIdAndPumpId(shiftDefinitionId, pumpId)
                        .map(def -> LocalDateTime.of(date, def.getStartTime()).atZone(zone).toOffsetDateTime())
                        .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                                "Shift definition not found"));

        return Arrays.stream(FuelType.values())
                .map(fuelType -> FuelPriceForDateResponse.builder()
                        .fuelType(fuelType.name())
                        .pricePerUnit(fuelPriceRepository
                                .findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                                        pumpId, fuelType, asOf)
                                .map(GlobalFuelPrice::getPricePerUnit)
                                .orElse(null))
                        .build())
                .toList();
    }

    /**
     * Each price is a new record; earlier prices stay as history. A change of more than 15% from the
     * last price needs confirmed=true, otherwise PriceDeviationException (409) asks the caller to confirm.
     */
    @Transactional
    public SetFuelPriceResponse setPrice(Long pumpId, SetFuelPriceRequest request, User currentUser) {
        requireConfirmationForLargeChange(pumpId, request);

        GlobalFuelPrice saved = fuelPriceRepository.save(GlobalFuelPrice.builder()
                .pumpId(pumpId)
                .fuelType(request.getFuelType())
                .pricePerUnit(request.getPricePerUnit().setScale(2, RoundingMode.HALF_UP))
                .setByUserId(currentUser.getId())
                .build());

        auditService.log(pumpId, AuditAction.FUEL_PRICE_UPDATED,
                "GlobalFuelPrice", saved.getId().toString(),
                "Fuel price updated: " + saved.getFuelType() + " → ₹" + saved.getPricePerUnit(),
                currentUser);

        int openShiftsCount = shiftRepository.findActiveShiftsByPump(pumpId).size();
        if (openShiftsCount > 0) {
            warnAboutOpenShifts(pumpId, saved, openShiftsCount);
        }

        return SetFuelPriceResponse.builder()
                .price(saved)
                .openShiftsCount(openShiftsCount)
                .openShiftsWarning(openShiftsCount > 0
                        ? openShiftsCount + " shift(s) are currently open at this pump. They will settle at the OLD price. " +
                          "Close all open shifts before the new price takes effect to avoid balance discrepancies."
                        : null)
                .build();
    }

    private void requireConfirmationForLargeChange(Long pumpId, SetFuelPriceRequest request) {
        fuelPriceRepository.findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, request.getFuelType())
                .map(GlobalFuelPrice::getPricePerUnit)
                .filter(lastPrice -> lastPrice.compareTo(BigDecimal.ZERO) > 0)
                .ifPresent(lastPrice -> {
                    BigDecimal newPrice = request.getPricePerUnit();
                    BigDecimal deviation = newPrice.subtract(lastPrice).abs()
                            .divide(lastPrice, 4, RoundingMode.HALF_UP)
                            .multiply(BigDecimal.valueOf(100))
                            .setScale(2, RoundingMode.HALF_UP);
                    if (deviation.compareTo(MAX_UNCONFIRMED_DEVIATION_PERCENT) > 0 && !request.isConfirmed()) {
                        throw new PriceDeviationException(lastPrice, newPrice, deviation);
                    }
                });
    }

    // Open shifts keep the price snapshotted when they opened; one notification per pump per day.
    private void warnAboutOpenShifts(Long pumpId, GlobalFuelPrice saved, int openShiftsCount) {
        String dedupKey = "PRICE_CHANGE_OPEN_SHIFT:" + businessClock.today() + ":" + pumpId;
        notificationDedupService.maybeInsert(pumpId,
                NotificationType.PRICE_CHANGE_OPEN_SHIFT, dedupKey,
                "Fuel Price Changed With Open Shifts",
                saved.getFuelType() + " price updated to ₹" + saved.getPricePerUnit() +
                " but " + openShiftsCount + " shift(s) are still open. They will settle at the old price. " +
                "Close all open shifts to avoid balance discrepancies.",
                Map.of("fuelTypeCode", saved.getFuelType().name(), "price", saved.getPricePerUnit().toPlainString(),
                        "openShiftCount", openShiftsCount));
    }
}
