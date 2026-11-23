package com.ppms.settlement;

import com.ppms.common.dto.PageRequests;
import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

import java.util.List;

/**
 * Manages payment settlement records and per-pump alert configurations.
 *
 * All endpoints are scoped to a pump via /api/pumps/{pumpId}/...
 * OWNER, ADMIN and MANAGER can record settlements; only OWNER and ADMIN can void them or update configs.
 */
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class PaymentSettlementController {

    private final PaymentSettlementService service;

    // ── Settlement configs ────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/settlement-configs
     * Returns alert configs for all three payment types (UPI, CARD, FLEET_CARD).
     * Returns defaults (18:00, enabled=true) for types not yet explicitly configured.
     */
    @GetMapping("/{pumpId}/settlement-configs")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public List<ConfigResponse> getConfigs(@PathVariable Long pumpId) {
        return service.getConfigs(pumpId);
    }

    /**
     * PUT /api/pumps/{pumpId}/settlement-configs/{paymentType}
     * Creates or updates the alert config for one payment type.
     * paymentType: UPI | CARD | FLEET_CARD
     */
    @PutMapping("/{pumpId}/settlement-configs/{paymentType}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public ConfigResponse upsertConfig(
            @PathVariable Long pumpId,
            @PathVariable String paymentType,
            @Valid @RequestBody UpdateConfigRequest req,
            @AuthenticationPrincipal User currentUser) {
        return service.upsertConfig(pumpId, paymentType, req, currentUser);
    }

    // ── Settlement records ────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/settlements?page=0&size=20&paymentType=UPI
     * Paginated list of settlement records, newest first.
     * paymentType is optional — omit to return all types.
     */
    @GetMapping("/{pumpId}/settlements")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public PagedResponse<SettlementResponse> list(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String paymentType) {
        return service.list(pumpId, paymentType, PageRequests.of(page, size));
    }

    /**
     * POST /api/pumps/{pumpId}/settlements
     * Records a new settlement entry (amount received in bank for a given date).
     */
    @PostMapping("/{pumpId}/settlements")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @ResponseStatus(HttpStatus.CREATED)
    public SettlementResponse record(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordSettlementRequest req,
            @AuthenticationPrincipal User currentUser) {
        return service.record(pumpId, req, currentUser);
    }

    /**
     * POST /api/pumps/{pumpId}/settlements/{settlementId}/void
     * Voids a settlement entered by mistake. Body: { "reason": "..." } (required).
     */
    @PostMapping("/{pumpId}/settlements/{settlementId}/void")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public SettlementResponse voidSettlement(
            @PathVariable Long pumpId,
            @PathVariable Long settlementId,
            @Valid @RequestBody VoidSettlementRequest req,
            @AuthenticationPrincipal User currentUser) {
        return service.voidSettlement(pumpId, settlementId, req, currentUser);
    }

    /**
     * GET /api/pumps/{pumpId}/settlements/wallet
     * Returns the current wallet balance per payment type:
     *   pending = SUM(all shift collections) − SUM(all ACTIVE settlements)
     */
    @GetMapping("/{pumpId}/settlements/wallet")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public WalletSummary getWallet(@PathVariable Long pumpId) {
        return service.getWalletSummary(pumpId);
    }

    /**
     * GET /api/pumps/{pumpId}/settlements/pending-by-age
     * Unsettled UPI / Card / Fleet Card collections grouped into runs of consecutive collection days, oldest first,
     * with each run's age and whether it is past the T+2 settlement window.
     */
    @GetMapping("/{pumpId}/settlements/pending-by-age")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public List<PendingSettlementRange> getPendingByAge(@PathVariable Long pumpId) {
        return service.getPendingByAge(pumpId);
    }

    /**
     * GET /api/pumps/{pumpId}/settlements/daily-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
     * Returns one entry per date (newest first) combining shift collections and recorded settlements.
     * Dates with no activity on either side are omitted.
     */
    @GetMapping("/{pumpId}/settlements/daily-summary")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public PagedResponse<DailySummaryEntry> getDailySummary(
            @PathVariable Long pumpId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "10") int size) {
        return service.getDailySummary(pumpId, from, to, PageRequests.of(page, size));
    }
}
