package com.ppms.cash;

import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
public class CashDrawerController {

    private final CashEventRepository cashEventRepository;

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
            @RequestParam(required = false) CashEventType eventType) {

        // Balance computed from ALL events — filter does not affect the balance figure.
        List<CashEvent> allEvents = cashEventRepository.findByPumpIdOrderByEventDateDescCreatedAtDesc(pumpId);
        BigDecimal balance = allEvents.stream()
                .filter(e -> e.getEventType() == CashEventType.OPENING_BALANCE
                          || e.getEventType() == CashEventType.CASH_IN
                          || e.getEventType() == CashEventType.CASH_OUT)
                .map(e -> e.getEventType() == CashEventType.CASH_OUT
                        ? e.getAmount().negate()
                        : e.getAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);

        var pageReq = PageRequest.of(page, size);
        var pagedEvents = (eventType != null)
                ? cashEventRepository.findByPumpIdAndEventTypeOrderByEventDateDescCreatedAtDesc(pumpId, eventType, pageReq)
                : cashEventRepository.findByPumpIdOrderByEventDateDescCreatedAtDesc(pumpId, pageReq);

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

        BigDecimal amount = req.getAmount().setScale(2, RoundingMode.HALF_UP);

        // Guard: cash-out cannot exceed the current drawer balance.
        if (req.getEventType() == CashEventType.CASH_OUT) {
            BigDecimal currentBalance = cashEventRepository
                    .findByPumpIdOrderByEventDateDescCreatedAtDesc(pumpId)
                    .stream()
                    .filter(e -> e.getEventType() == CashEventType.OPENING_BALANCE
                              || e.getEventType() == CashEventType.CASH_IN
                              || e.getEventType() == CashEventType.CASH_OUT)
                    .map(e -> e.getEventType() == CashEventType.CASH_OUT
                            ? e.getAmount().negate()
                            : e.getAmount())
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);

            if (amount.compareTo(currentBalance) > 0) {
                throw new BusinessException(
                        "Cash-out amount ₹" + amount
                        + " exceeds the current drawer balance of ₹" + currentBalance + ".");
            }
        }

        CashEvent event = CashEvent.builder()
                .pumpId(pumpId)
                .eventType(req.getEventType())
                .amount(amount)
                .description(req.getDescription().trim())
                .eventDate(req.getEventDate())
                .recordedByUserId(currentUser.getId())
                .build();

        return cashEventRepository.save(event);
    }
}
