package com.ppms.inventory;

import com.ppms.common.dto.PagedResponse;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryWorkflowService workflowService;
    private final InventoryQueryService queryService;

    /**
     * GET /api/inventory/{pumpId}/tanks
     * Current stock levels for all non-decommissioned tanks at a pump.
     */
    @GetMapping("/{pumpId}/tanks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<TankStockResponse>> getTankStocks(@PathVariable Long pumpId) {
        return ResponseEntity.ok(queryService.getTankStocks(pumpId));
    }

    /**
     * POST /api/inventory/{pumpId}/deliveries
     * Records a tanker delivery: delivery record, FIFO lot, and added tank stock.
     */
    @PostMapping("/{pumpId}/deliveries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<TankerDeliveryResponse> recordDelivery(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workflowService.recordDelivery(pumpId, request, currentUser));
    }

    /**
     * POST /api/inventory/{pumpId}/deliveries/batch
     * Records every tank line of one tanker trip in a single transaction.
     */
    @PostMapping("/{pumpId}/deliveries/batch")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<TankerDeliveryResponse>> recordBatchDelivery(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordBatchDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workflowService.recordBatchDelivery(pumpId, request, currentUser));
    }

    /**
     * PATCH /api/inventory/{pumpId}/deliveries/{deliveryId}
     * Corrects a recorded delivery; quantity cannot drop below what shifts already consumed.
     */
    @PatchMapping("/{pumpId}/deliveries/{deliveryId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<TankerDeliveryResponse> updateDelivery(
            @PathVariable Long pumpId,
            @PathVariable Long deliveryId,
            @Valid @RequestBody UpdateDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(workflowService.updateDelivery(pumpId, deliveryId, request, currentUser));
    }

    /**
     * GET /api/inventory/{pumpId}/deliveries?page=0&size=50
     * Paginated tanker deliveries, newest first.
     */
    @GetMapping("/{pumpId}/deliveries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<TankerDeliveryResponse>> getDeliveries(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(queryService.getDeliveries(pumpId, page, size));
    }

    /**
     * POST /api/inventory/{pumpId}/dip-checks
     * Records a physical DIP measurement; tank stock is corrected to the measured value.
     */
    @PostMapping("/{pumpId}/dip-checks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<DipCheckResponse> recordDipCheck(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordDipCheckRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workflowService.recordDipCheck(pumpId, request, currentUser));
    }

    /**
     * PATCH /api/inventory/{pumpId}/dip-checks/{dipCheckId}/review
     * Acknowledges an above-tolerance DIP check (PENDING_REVIEW → REVIEWED).
     */
    @PatchMapping("/{pumpId}/dip-checks/{dipCheckId}/review")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<DipCheckResponse> reviewDipCheck(
            @PathVariable Long pumpId,
            @PathVariable Long dipCheckId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(workflowService.reviewDipCheck(pumpId, dipCheckId, currentUser));
    }

    /**
     * GET /api/inventory/{pumpId}/dip-checks?page=0&size=50
     * Paginated DIP check history, newest first.
     */
    @GetMapping("/{pumpId}/dip-checks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<DipCheckResponse>> getDipChecks(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(queryService.getDipChecks(pumpId, page, size));
    }

    /**
     * DELETE /api/inventory/{pumpId}/deliveries/latest
     * Deletes the most recently entered invoice (all its tank lines) while none of its fuel has been sold.
     */
    @DeleteMapping("/{pumpId}/deliveries/latest")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLatestDelivery(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        workflowService.deleteLatestDelivery(pumpId, currentUser);
    }

    /**
     * GET /api/inventory/{pumpId}/tanks/{tankId}/lots
     * Active FIFO lots for one tank, oldest first.
     */
    @GetMapping("/{pumpId}/tanks/{tankId}/lots")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<InventoryLotDetailResponse>> getActiveTankLots(
            @PathVariable Long pumpId,
            @PathVariable Long tankId) {
        return ResponseEntity.ok(queryService.getActiveTankLots(pumpId, tankId));
    }
}
