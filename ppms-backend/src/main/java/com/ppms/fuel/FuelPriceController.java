package com.ppms.fuel;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pumps/{pumpId}/fuel-prices")
@RequiredArgsConstructor
public class FuelPriceController {

    private final FuelPriceService fuelPriceService;

    /** Operators need the current price to open a shift, so every operational role may read it. */
    @GetMapping("/current")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public ResponseEntity<List<GlobalFuelPrice>> getCurrentPrices(@PathVariable Long pumpId) {
        return ResponseEntity.ok(fuelPriceService.getCurrentPrices(pumpId));
    }

    /** pricePerUnit is null for a fuel type with no price recorded by then. */
    @GetMapping("/for-date")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<FuelPriceForDateResponse>> getPricesForDate(
            @PathVariable Long pumpId,
            @RequestParam LocalDate date,
            @RequestParam(required = false) Long shiftDefinitionId) {
        return ResponseEntity.ok(fuelPriceService.getPricesForDate(pumpId, date, shiftDefinitionId));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<SetFuelPriceResponse> setPrice(
            @PathVariable Long pumpId,
            @Valid @RequestBody SetFuelPriceRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(fuelPriceService.setPrice(pumpId, request, currentUser));
    }
}
