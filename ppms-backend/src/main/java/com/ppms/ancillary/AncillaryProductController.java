package com.ppms.ancillary;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * REST controller for the Ancillary Products feature.
 *
 * All endpoints are scoped to /{pumpId}/ancillary/... to keep them consistent
 * with ExpenseController and other pump-scoped controllers.
 *
 * Role rules:
 * - Product management (create/update/status/price): OWNER, ADMIN only
 * - Stock deliveries: OWNER, ADMIN, MANAGER
 * - Sales: OWNER, ADMIN, MANAGER
 * - Read endpoints: any authenticated user (guards applied per endpoint)
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR')")
public class AncillaryProductController {

    private final AncillaryProductRepository productRepository;
    private final AncillaryProductPriceRepository priceRepository;
    private final AncillaryStockDeliveryRepository deliveryRepository;
    private final AncillaryProductAccessService accessService;
    private final AncillaryProductQueryService queryService;
    private final AncillaryInventoryWorkflowService workflowService;
    private final AuditService auditService;

    // ── Product catalog ───────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/ancillary/products
     * Returns all products for this pump, all statuses.
     * Each product includes the current selling price (null if not set).
     */
    @GetMapping("/{pumpId}/ancillary/products")
    public ResponseEntity<List<AncillaryProductResponse>> getProducts(@PathVariable Long pumpId) {
        return ResponseEntity.ok(queryService.getProducts(pumpId));
    }

    /**
     * POST /api/pumps/{pumpId}/ancillary/products
     * Creates a new SKU in the catalog for this pump.
     * Initial stock is 0 — stock-in is recorded separately via the deliveries endpoint.
     * Owner/Admin only.
     */
    @PostMapping("/{pumpId}/ancillary/products")
    @Transactional
    public ResponseEntity<AncillaryProductResponse> createProduct(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateProductRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryProduct product = workflowService.createProduct(pumpId, request);

        log.info("Ancillary product created: pump={}, productId={}, name={}, by={}",
                pumpId, product.getId(), product.getName(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(queryService.toProductResponseWithLots(product));
    }

    /**
     * PATCH /api/pumps/{pumpId}/ancillary/products/{id}
     * Updates brand, variant, and/or lowStockThreshold.
     * Name, packageSize, and unitOfMeasure cannot be changed after creation.
     * Owner/Admin only.
     */
    @PatchMapping("/{pumpId}/ancillary/products/{id}")
    @Transactional
    public ResponseEntity<AncillaryProductResponse> updateProduct(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @RequestBody UpdateProductRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryProduct product = workflowService.updateProduct(pumpId, id, request);

        log.info("Ancillary product updated: pump={}, productId={}, by={}", pumpId, id, currentUser.getId());

        return ResponseEntity.ok(queryService.toProductResponseWithLots(product));
    }

    /**
     * PATCH /api/pumps/{pumpId}/ancillary/products/{id}/status
     * Toggles product status between ACTIVE and INACTIVE.
     * Inactive products cannot be sold or restocked.
     * Owner/Admin only.
     */
    @PatchMapping("/{pumpId}/ancillary/products/{id}/status")
    @Transactional
    public ResponseEntity<AncillaryProductResponse> setProductStatus(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @RequestParam AncillaryProductStatus status,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryProduct product = workflowService.setProductStatus(pumpId, id, status);

        log.info("Ancillary product status changed: pump={}, productId={}, newStatus={}, by={}",
                pumpId, id, status, currentUser.getId());

        return ResponseEntity.ok(queryService.toProductResponseWithLots(product));
    }

    // ── Selling price history ─────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/ancillary/products/{id}/prices
     * Returns full price history for a product, newest first.
     */
    @GetMapping("/{pumpId}/ancillary/products/{id}/prices")
    public ResponseEntity<List<AncillaryProductPrice>> getPriceHistory(
            @PathVariable Long pumpId,
            @PathVariable Long id) {
        accessService.requireProductForPump(id, pumpId);
        return ResponseEntity.ok(priceRepository.findByProductIdOrderByEffectiveFromDesc(id));
    }

    /**
     * POST /api/pumps/{pumpId}/ancillary/products/{id}/prices
     * Sets a new selling price. Does not modify previous price rows — immutable history.
     * Owner/Admin only.
     */
    @PostMapping("/{pumpId}/ancillary/products/{id}/prices")
    @Transactional
    public ResponseEntity<AncillaryProductPrice> setPrice(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody SetProductPriceRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryProductPrice price = workflowService.setPrice(pumpId, id, request, currentUser);

        log.info("Ancillary product price set: pump={}, productId={}, price={}, by={}",
                pumpId, id, price.getPricePerUnit(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(price);
    }

    // ── Stock deliveries ──────────────────────────────────────────────────────

    /**
     * POST /api/pumps/{pumpId}/ancillary/products/{id}/deliveries
     * Records a stock-in batch. Creates an inventory lot for FIFO tracking.
     * Owner/Admin/Manager.
     */
    @PostMapping("/{pumpId}/ancillary/products/{id}/deliveries")
    @Transactional
    public ResponseEntity<AncillaryStockDelivery> recordDelivery(
            @PathVariable Long pumpId,
            @PathVariable Long id,
            @Valid @RequestBody RecordStockDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireManagerOrAbove(currentUser);

        AncillaryInventoryWorkflowService.DeliveryResult result = workflowService.recordDelivery(
                pumpId, id, request, currentUser);
        AncillaryProduct product = result.getProduct();
        AncillaryStockDelivery delivery = result.getDelivery();
        AncillaryStockLot lot = result.getLot();

        log.info("Ancillary delivery recorded: pump={}, productId={}, units={}, cost={}, lot={}, backfilled={}, by={}",
                pumpId, id, request.getQuantityUnits(), delivery.getCostPricePerUnit(),
                lot.getId(), delivery.isBackfilled(), currentUser.getId());

        AuditAction deliveryAuditAction = delivery.isBackfilled()
                ? AuditAction.ANCILLARY_DELIVERY_BACKFILLED
                : AuditAction.ANCILLARY_DELIVERY_RECORDED;
        auditService.log(pumpId, deliveryAuditAction,
                "AncillaryStockDelivery", delivery.getId().toString(),
                (delivery.isBackfilled() ? "Backfilled stock delivery: " : "Stock delivery: ")
                + product.getName() + " × " + request.getQuantityUnits() +
                " units at ₹" + delivery.getCostPricePerUnit() + "/unit",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(delivery);
    }

    /**
     * GET /api/pumps/{pumpId}/ancillary/deliveries?page=0&size=50
     * Returns paginated deliveries for a pump, newest first.
     */
    @GetMapping("/{pumpId}/ancillary/deliveries")
    public ResponseEntity<PagedResponse<AncillaryStockDelivery>> getDeliveries(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return ResponseEntity.ok(PagedResponse.of(
                deliveryRepository.findByPumpIdOrderByDeliveryDateDescCreatedAtDesc(pumpId, PageRequest.of(page, size))));
    }

    // ── Counter sales ─────────────────────────────────────────────────────────

    /**
     * POST /api/pumps/{pumpId}/ancillary/sales
     * Records a counter sale. Performs FIFO lot deduction and snapshots the current price.
     *
     * Business rules enforced:
     * 1. Product must be ACTIVE and belong to this pump.
     * 2. A selling price must be set — sale is rejected if no price exists.
     * 3. Stock must be sufficient — rejected if not enough units available.
     * 4. CREDIT sales require clientName.
     * 5. Only OWNER, ADMIN, MANAGER can record sales.
     */
    @PostMapping("/{pumpId}/ancillary/sales")
    @Transactional
    public ResponseEntity<AncillarySaleResponse> recordSale(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordAncillarySaleRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireManagerOrAbove(currentUser);

        AncillaryInventoryWorkflowService.SaleResult result = workflowService.recordSale(pumpId, request, currentUser);
        AncillaryProduct product = result.getProduct();
        AncillarySale sale = result.getSale();

        log.info("Ancillary sale recorded: pump={}, productId={}, saleId={}, units={}, total={}, mode={}, by={}",
                pumpId, product.getId(), sale.getId(), request.getQuantityUnits(),
                sale.getTotalAmount(), request.getPaymentMode(), currentUser.getId());

        auditService.log(pumpId, AuditAction.ANCILLARY_SALE_RECORDED,
                "AncillarySale", sale.getId().toString(),
                "Sale: " + product.getName() + " × " + request.getQuantityUnits() + " units, total ₹" +
                sale.getTotalAmount() + " (" + request.getPaymentMode() + ")",
                currentUser);
        if (result.getCashEvent() != null) {
            log.info("Cash event recorded for ancillary sale: pump={}, saleId={}, amount={}",
                    pumpId, sale.getId(), sale.getTotalWithGst());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(queryService.toSaleResponse(sale, product));
    }

    /**
     * POST /api/pumps/{pumpId}/ancillary/sales/backfill
     * Retroactively records a historical counter sale for a past date.
     *
     * Business rules enforced:
     * 1. Only OWNER and ADMIN are allowed (managers cannot backfill).
     * 2. saleDate must be strictly before today (IST).
     * 3. The selling price is resolved automatically from the product's price history.
     * 4. At least one active lot must have been delivered on or before saleDate.
     * 5. Total available units across those historical lots must cover the requested quantity.
     */
    @PostMapping("/{pumpId}/ancillary/sales/backfill")
    @Transactional
    public ResponseEntity<AncillarySaleResponse> backfillSale(
            @PathVariable Long pumpId,
            @Valid @RequestBody BackfillSaleRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryInventoryWorkflowService.SaleResult result = workflowService.backfillSale(pumpId, request, currentUser);
        AncillaryProduct product = result.getProduct();
        AncillarySale sale = result.getSale();

        auditService.log(pumpId, AuditAction.ANCILLARY_SALE_BACKFILLED,
                "AncillarySale", sale.getId().toString(),
                "Backfilled sale: " + product.getName() + " × " + request.getQuantityUnits() +
                " units on " + request.getSaleDate() + ", total ₹" +
                sale.getTotalAmount() + " (" + request.getPaymentMode() + ")",
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(queryService.toSaleResponse(sale, product));
    }

    /**
     * GET /api/pumps/{pumpId}/ancillary/sales?page=0&size=50
     * Returns paginated sales for a pump, newest first.
     */
    @GetMapping("/{pumpId}/ancillary/sales")
    public ResponseEntity<PagedResponse<AncillarySaleResponse>> getSales(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        return ResponseEntity.ok(queryService.getSales(pumpId, page, size));
    }

    // ── Stock lots ────────────────────────────────────────────────────────────

    /**
     * GET /api/pumps/{pumpId}/ancillary/products/{id}/lots
     * Returns all ACTIVE FIFO lots for the product in consumption order (oldest first).
     * Exhausted lots are excluded — the dialog only shows remaining stock.
     * Any authenticated user can view this.
     */
    @GetMapping("/{pumpId}/ancillary/products/{id}/lots")
    public ResponseEntity<List<AncillaryLotDetailResponse>> getActiveLots(
            @PathVariable Long pumpId,
            @PathVariable Long id) {

        accessService.requireProductForPump(id, pumpId);
        return ResponseEntity.ok(queryService.getActiveLots(id));
    }

    /**
     * PATCH /api/pumps/{pumpId}/ancillary/lots/{lotId}
     * Adjusts a lot's cost price and/or remaining quantity (stock correction).
     * Owner/Admin only.
     *
     * When remainingQuantity changes, product.currentStockUnits is adjusted by the delta
     * so the product's total stock stays consistent.
     */
    @PatchMapping("/{pumpId}/ancillary/lots/{lotId}")
    @Transactional
    public ResponseEntity<AncillaryLotDetailResponse> updateLot(
            @PathVariable Long pumpId,
            @PathVariable Long lotId,
            @RequestBody UpdateLotRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        AncillaryInventoryWorkflowService.LotCorrectionResult result = workflowService.updateLot(pumpId, lotId, request);
        AncillaryStockLot lot = result.getLot();

        log.info("Ancillary lot corrected: pump={}, lotId={}, remainingQty={}, costPrice={}, by={}",
                pumpId, lotId, lot.getRemainingQuantity(), lot.getCostPricePerUnit(), currentUser.getId());
        return ResponseEntity.ok(queryService.toLotDetailResponse(lot, result.getDelivery()));
    }

    private void requireOwnerOrAdmin(User user) {
        if (user.getRole() != UserRole.OWNER && user.getRole() != UserRole.ADMIN
                && user.getRole() != UserRole.SUPER_ADMIN) {
            throw new BusinessException("Only Owner or Admin can manage ancillary products and prices.");
        }
    }

    private void requireManagerOrAbove(User user) {
        if (user.getRole() == UserRole.OPERATOR || user.getRole() == UserRole.ACCOUNTANT) {
            throw new BusinessException("Operators and Accountants cannot record ancillary sales or deliveries.");
        }
    }
}
