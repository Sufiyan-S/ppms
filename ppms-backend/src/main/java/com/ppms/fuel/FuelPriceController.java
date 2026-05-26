package com.ppms.fuel;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.notification.NotificationDedupService;
import com.ppms.notification.NotificationType;
import com.ppms.shift.ShiftRepository;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/fuel-prices")
@RequiredArgsConstructor
public class FuelPriceController {

    private final GlobalFuelPriceRepository fuelPriceRepository;
    private final ShiftRepository shiftRepository;
    private final AuditService auditService;
    private final NotificationDedupService notificationDedupService;

    /**
     * GET /api/fuel-prices/current?pumpId={id}
     * Returns the most recently set price for each fuel type at a pump.
     * Accessible by all operational roles — operators need the current price to open a shift.
     */
    @GetMapping("/current")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public ResponseEntity<List<GlobalFuelPrice>> getCurrentPrices(@RequestParam Long pumpId) {
        return ResponseEntity.ok(fuelPriceRepository.findCurrentPricesForPump(pumpId));
    }

    /**
     * GET /api/fuel-prices/for-date?pumpId={id}&date=YYYY-MM-DD
     * Returns the price that was effective for each fuel type at a pump on the given historical date.
     * pricePerUnit is null when no price record exists on or before that date for a fuel type.
     * Used by the backfill shift modal to show resolved rates and flag which ones need manual entry.
     */
    @GetMapping("/for-date")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<FuelPriceForDateResponse>> getPricesForDate(
            @RequestParam Long pumpId,
            @RequestParam LocalDate date) {

        ZoneId ist = ZoneId.of("Asia/Kolkata");
        OffsetDateTime asOf = date.plusDays(1).atStartOfDay(ist).toOffsetDateTime();

        List<FuelPriceForDateResponse> responses = Arrays.stream(FuelType.values())
                .map(fuelType -> {
                    Optional<GlobalFuelPrice> price =
                            fuelPriceRepository.findFirstByPumpIdAndFuelTypeAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(
                                    pumpId, fuelType, asOf);
                    return FuelPriceForDateResponse.builder()
                            .fuelType(fuelType.name())
                            .pricePerUnit(price.map(GlobalFuelPrice::getPricePerUnit).orElse(null))
                            .build();
                })
                .toList();

        return ResponseEntity.ok(responses);
    }

    /**
     * POST /api/fuel-prices
     * Sets (or updates) a fuel price for a pump.
     * Creates a new immutable price record — previous prices are retained as history (spec Rule 15).
     *
     * 15% deviation guard (Business Rule 37, Section 6.12):
     * If the new price deviates >15% from the last recorded price and confirmed=false,
     * returns HTTP 409 with a PriceDeviationWarning. The frontend must show a confirmation
     * dialog and re-submit with confirmed=true to bypass the guard.
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<?> setPrice(
            @Valid @RequestBody SetFuelPriceRequest request,
            @AuthenticationPrincipal User currentUser) {

        // Check for >15% deviation against the last recorded price for this fuel type at this pump
        fuelPriceRepository.findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(
                request.getPumpId(), request.getFuelType()).ifPresent(last -> {

            BigDecimal lastPrice = last.getPricePerUnit();
            BigDecimal newPrice  = request.getPricePerUnit();

            if (lastPrice.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal deviation = newPrice.subtract(lastPrice).abs()
                        .divide(lastPrice, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .setScale(2, RoundingMode.HALF_UP);

                if (deviation.compareTo(new BigDecimal("15")) > 0 && !request.isConfirmed()) {
                    // Signal to the caller that confirmation is needed — throw a checked-style exception
                    // that the controller catches and converts to 409.
                    throw new PriceDeviationException(lastPrice, newPrice, deviation);
                }
            }
        });

        GlobalFuelPrice price = GlobalFuelPrice.builder()
                .pumpId(request.getPumpId())
                .fuelType(request.getFuelType())
                .pricePerUnit(request.getPricePerUnit())
                .setByUserId(currentUser.getId())
                .build();

        GlobalFuelPrice saved = fuelPriceRepository.save(price);

        auditService.log(request.getPumpId(), AuditAction.FUEL_PRICE_UPDATED,
                "GlobalFuelPrice", saved.getId().toString(),
                "Fuel price updated: " + saved.getFuelType() + " → ₹" + saved.getPricePerUnit(),
                currentUser);

        // P2.3 — Warn if there are open shifts at this pump.
        // Open shifts already have the old price snapshotted — they will NOT pick up the new price.
        // The admin should close all open shifts first to avoid revenue mismatch on the day's balance sheet.
        List<?> openShifts = shiftRepository.findActiveShiftsByPump(request.getPumpId());
        int openShiftsCount = openShifts.size();
        String warning = openShiftsCount > 0
                ? openShiftsCount + " shift(s) are currently open at this pump. They will settle at the OLD price. " +
                  "Close all open shifts before the new price takes effect to avoid balance discrepancies."
                : null;

        if (openShiftsCount > 0) {
            // Fire a PRICE_CHANGE_OPEN_SHIFT notification deduped per pump per day.
            // One notification per day is enough — if the admin changes price multiple times
            // on the same day while shifts remain open, we avoid spamming.
            String dedupKey = "PRICE_CHANGE_OPEN_SHIFT:" + LocalDate.now() + ":" + request.getPumpId();
            notificationDedupService.maybeInsert(request.getPumpId(),
                    NotificationType.PRICE_CHANGE_OPEN_SHIFT, dedupKey,
                    "Fuel Price Changed With Open Shifts",
                    saved.getFuelType() + " price updated to ₹" + saved.getPricePerUnit() +
                    " but " + openShiftsCount + " shift(s) are still open. They will settle at the old price. " +
                    "Close all open shifts to avoid balance discrepancies.");
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(SetFuelPriceResponse.builder()
                        .price(saved)
                        .openShiftsCount(openShiftsCount)
                        .openShiftsWarning(warning)
                        .build());
    }
}
