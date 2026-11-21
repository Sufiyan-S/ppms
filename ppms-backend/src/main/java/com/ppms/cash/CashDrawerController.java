package com.ppms.cash;

import com.ppms.common.dto.PageRequests;
import com.ppms.common.time.DateRangeBounds;
import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
public class CashDrawerController {

    private final CashEventRepository cashEventRepository;
    private final CashDrawerService cashDrawerService;

    /**
     * GET /api/pumps/{pumpId}/cash-events?page=0&size=50&eventType=CASH_IN
     * Returns paginated cash events newest first, plus the computed running balance.
     *
     * eventType is an optional filter — omit to return all event types.
     * The balance is always computed from ALL events (not just the filtered/current page)
     * so it always reflects the true cash position regardless of active filters.
     */
    @GetMapping("/{pumpId}/cash-events")
    public Map<String, Object> getCashEvents(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) CashEventType eventType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {

        // Balance computed via a single DB aggregate — avoids loading all events into heap.
        BigDecimal balance = cashEventRepository.computeBalance(pumpId).setScale(2, RoundingMode.HALF_UP);

        var pageReq = PageRequests.of(page, size);
        Page<CashEvent> pagedEvents;
        if (from == null && to == null) {
            pagedEvents = (eventType != null)
                    ? cashEventRepository.findByPumpIdAndEventTypeOrderByEventDateDescCreatedAtDesc(pumpId, eventType, pageReq)
                    : cashEventRepository.findByPumpIdOrderByEventDateDescCreatedAtDesc(pumpId, pageReq);
        } else {
            LocalDate fromDate = DateRangeBounds.startOrEarliest(from);
            LocalDate toDate = DateRangeBounds.endOrLatest(to);
            DateRangeBounds.requireStartNotAfterEnd(fromDate, toDate);
            pagedEvents = (eventType != null)
                    ? cashEventRepository.findByPumpIdAndEventTypeAndEventDateBetweenOrderByEventDateDescCreatedAtDesc(
                            pumpId, eventType, fromDate, toDate, pageReq)
                    : cashEventRepository.findByPumpIdAndEventDateBetweenOrderByEventDateDescCreatedAtDesc(
                            pumpId, fromDate, toDate, pageReq);
        }

        return Map.of("events", PagedResponse.of(pagedEvents), "currentBalance", balance);
    }

    /**
     * POST /api/pumps/{pumpId}/cash-events
     * Records a new cash movement.
     */
    @PostMapping("/{pumpId}/cash-events")
    @ResponseStatus(HttpStatus.CREATED)
    public CashEvent recordCashEvent(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordCashEventRequest req,
            @AuthenticationPrincipal User currentUser) {
        return cashDrawerService.recordCashEvent(pumpId, req, currentUser);
    }
}
