package com.ppms.inventory;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import com.ppms.common.dto.PagedResponse;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/inventory")
@RequiredArgsConstructor
public class InventoryController {
    private final UndergroundTankRepository tankRepository;
    private final TankerDeliveryRepository tankerDeliveryRepository;
    private final InventoryLotRepository inventoryLotRepository;
    private final DipCheckRepository dipCheckRepository;
    private final UserRepository userRepository;
    private final GlobalFuelPriceRepository globalFuelPriceRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    /**
     * GET /api/inventory/{pumpId}/tanks
     * Returns current stock levels for all active tanks at a pump.
     * Used by the Inventory page stock bars and the Overview page stats.
     */
    @GetMapping("/{pumpId}/tanks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<TankStockResponse>> getTankStocks(@PathVariable Long pumpId) {
        List<TankStockResponse> stocks = tankRepository.findByPumpId(pumpId)
                .stream()
                .filter(t -> t.getStatus() != TankStatus.DECOMMISSIONED)
                .map(this::toTankStockResponse)
                .toList();
        return ResponseEntity.ok(stocks);
    }

    /**
     * POST /api/inventory/{pumpId}/deliveries
     * Records a tanker delivery. Owner/Admin only.
     *
     * What this does:
     * 1. Creates a TankerDelivery record (the physical delivery event + invoice)
     * 2. Creates an InventoryLot so FIFO deduction knows the cost and delivery order
     * 3. Adds the delivered quantity to the tank's current_stock
     */
    @PostMapping("/{pumpId}/deliveries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<TankerDeliveryResponse> recordDelivery(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {

        UndergroundTank tank = tankRepository.findById(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

        if (!tank.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tank does not belong to this pump");
        }

        if (tank.getStatus() == TankStatus.INACTIVE) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' is currently disabled. " +
                    "Re-enable it in Setup before recording a delivery.");
        }

        // P1.3 — Overflow guard: reject deliveries that would exceed the tank's physical capacity.
        // This prevents accidental data entry errors (e.g. entering 10000L into a 5000L tank).
        BigDecimal currentStock = tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
        BigDecimal availableCapacity = tank.getCapacity().subtract(currentStock).setScale(3, RoundingMode.HALF_UP);
        if (request.getQuantityDelivered().compareTo(availableCapacity) > 0) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' has only " + availableCapacity + "L of available capacity " +
                    "(capacity: " + tank.getCapacity().setScale(3, RoundingMode.HALF_UP) + "L, current stock: " +
                    currentStock.setScale(3, RoundingMode.HALF_UP) + "L). " +
                    "Delivery of " + request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP) + "L would overflow the tank.");
        }

        // Duplicate guard: same invoice + same fuel type + same pump = double-entry error.
        // The DB unique index (uq_delivery_pump_invoice_fuel) is the final safety net,
        // but we throw a descriptive BusinessException here so the user gets a clear message.
        String invoiceRefTrimmed = request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null;
        if (invoiceRefTrimmed != null && !invoiceRefTrimmed.isBlank()) {
            if (tankerDeliveryRepository.existsByPumpIdAndInvoiceReferenceAndFuelType(
                    pumpId, invoiceRefTrimmed, tank.getFuelType())) {
                throw new BusinessException(
                        "Invoice '" + invoiceRefTrimmed + "' already has a " + tank.getFuelType().name() +
                        " delivery recorded for this pump. Check the invoice number or use a different reference.");
            }
        }

        validateCostPriceAgainstSellingPrice(pumpId, tank, request.getCostPricePerUnit());

        var deliveryDateTime = request.getDeliveryDate()
                .atStartOfDay(businessClock.zone())
                .toOffsetDateTime();

        TankerDelivery delivery = TankerDelivery.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .quantityDelivered(request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP))
                .costPricePerUnit(request.getCostPricePerUnit())
                .deliveryDate(deliveryDateTime)
                .invoiceReference(request.getInvoiceReference().trim())
                .loggedByUserId(currentUser.getId())
                .build();

        delivery = tankerDeliveryRepository.save(delivery);

        // Create a FIFO lot so shift-close can correctly deduct from the oldest stock first
        InventoryLot lot = InventoryLot.builder()
                .tankerDeliveryId(delivery.getId())
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .pumpId(pumpId)
                .originalQuantity(request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP))
                .remainingQuantity(request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP))
                .costPricePerUnit(request.getCostPricePerUnit())
                .deliveryDate(deliveryDateTime)
                .isDipAdjustment(false)
                .status(LotStatus.ACTIVE)
                .build();

        inventoryLotRepository.save(lot);

        // Update tank running stock
        BigDecimal newStock = tank.getCurrentStock()
                .add(request.getQuantityDelivered())
                .setScale(3, RoundingMode.HALF_UP);
        tank.setCurrentStock(newStock);
        tankRepository.save(tank);

        log.info("Tanker delivery recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                pumpId, tank.getId(), tank.getFuelType(),
                request.getQuantityDelivered(), request.getInvoiceReference(), currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_RECORDED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery: " + tank.getFuelType() + " " + request.getQuantityDelivered() + "L to tank " +
                tank.getTankIdentifier() + " at ₹" + request.getCostPricePerUnit() + "/L, invoice=" +
                request.getInvoiceReference(),
                currentUser);

        String loggedByName = currentUser.getFullName();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toDeliveryResponse(delivery, tank, loggedByName));
    }

    /**
     * POST /api/inventory/{pumpId}/deliveries/batch
     * Records multiple tank deliveries from a single tanker trip in one atomic transaction.
     *
     * A tanker often carries multiple fuel types under one invoice (e.g. 20 KL petrol +
     * 10 KL speed petrol + 5 KL diesel). This endpoint saves all line items together so
     * a partial failure cannot leave tank stocks in an inconsistent state.
     *
     * Each line item follows the same logic as the single-delivery endpoint:
     * - Creates a TankerDelivery record
     * - Creates a FIFO InventoryLot
     * - Adds the quantity to the tank's current_stock
     */
    @PostMapping("/{pumpId}/deliveries/batch")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<List<TankerDeliveryResponse>> recordBatchDelivery(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordBatchDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {

        var deliveryDateTime = request.getDeliveryDate()
                .atStartOfDay(businessClock.zone())
                .toOffsetDateTime();

        String invoiceRef = request.getInvoiceReference().trim();
        String loggedByName = currentUser.getFullName();

        // Guard 1: reject batches that list the same tank more than once — that is always a data-entry mistake.
        java.util.Set<Long> seenTankIds = new java.util.HashSet<>();
        for (var item : request.getItems()) {
            if (!seenTankIds.add(item.getTankId())) {
                throw new BusinessException(
                        "Tank ID " + item.getTankId() + " appears more than once in this batch. " +
                        "Each tank can only receive one delivery per batch.");
            }
        }

        List<TankerDeliveryResponse> responses = request.getItems().stream().map(item -> {
            UndergroundTank tank = tankRepository.findById(item.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + item.getTankId()));

            if (!tank.getPumpId().equals(pumpId)) {
                throw new BusinessException("Tank " + tank.getTankIdentifier() + " does not belong to this pump");
            }

            if (tank.getStatus() == TankStatus.INACTIVE) {
                throw new BusinessException(
                        "Tank '" + tank.getTankIdentifier() + "' is currently disabled. " +
                        "Re-enable it in Setup before recording a delivery.");
            }

            // P1.3 — Overflow guard (same logic as single delivery endpoint)
            BigDecimal currentStockItem = tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
            BigDecimal availableCapacityItem = tank.getCapacity().subtract(currentStockItem).setScale(3, RoundingMode.HALF_UP);
            if (item.getQuantityDelivered().compareTo(availableCapacityItem) > 0) {
                throw new BusinessException(
                        "Tank '" + tank.getTankIdentifier() + "' has only " + availableCapacityItem + "L of available capacity " +
                        "(capacity: " + tank.getCapacity().setScale(3, RoundingMode.HALF_UP) + "L, current stock: " +
                        currentStockItem.setScale(3, RoundingMode.HALF_UP) + "L). " +
                        "Delivery of " + item.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP) + "L would overflow the tank.");
            }

            // Guard 2: duplicate check — same invoice + fuel type already on record for this pump.
            if (tankerDeliveryRepository.existsByPumpIdAndInvoiceReferenceAndFuelType(
                    pumpId, invoiceRef, tank.getFuelType())) {
                throw new BusinessException(
                        "Invoice '" + invoiceRef + "' already has a " + tank.getFuelType().name() +
                        " delivery recorded for this pump. Check the invoice number or use a different reference.");
            }

            validateCostPriceAgainstSellingPrice(pumpId, tank, item.getCostPricePerUnit());

            BigDecimal qty = item.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP);

            TankerDelivery delivery = TankerDelivery.builder()
                    .pumpId(pumpId)
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .quantityDelivered(qty)
                    .costPricePerUnit(item.getCostPricePerUnit())
                    .deliveryDate(deliveryDateTime)
                    .invoiceReference(invoiceRef)
                    .loggedByUserId(currentUser.getId())
                    .build();

            delivery = tankerDeliveryRepository.save(delivery);

            InventoryLot lot = InventoryLot.builder()
                    .tankerDeliveryId(delivery.getId())
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .pumpId(pumpId)
                    .originalQuantity(qty)
                    .remainingQuantity(qty)
                    .costPricePerUnit(item.getCostPricePerUnit())
                    .deliveryDate(deliveryDateTime)
                    .isDipAdjustment(false)
                    .status(LotStatus.ACTIVE)
                    .build();

            inventoryLotRepository.save(lot);

            BigDecimal newStock = tank.getCurrentStock().add(qty).setScale(3, RoundingMode.HALF_UP);
            tank.setCurrentStock(newStock);
            tankRepository.save(tank);

            log.info("Batch delivery item recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                    pumpId, tank.getId(), tank.getFuelType(), qty, invoiceRef, currentUser.getId());

            return toDeliveryResponse(delivery, tank, loggedByName);
        }).toList();

        return ResponseEntity.status(HttpStatus.CREATED).body(responses);
    }

    /**
     * GET /api/inventory/{pumpId}/deliveries?page=0&size=50
     * Returns paginated tanker deliveries for a pump, newest first.
     */
    @GetMapping("/{pumpId}/deliveries")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<TankerDeliveryResponse>> getDeliveries(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        var pageResult = tankerDeliveryRepository
                .findByPumpIdOrderByDeliveryDateDesc(pumpId, PageRequest.of(page, size));

        // Batch-load tank and user names to avoid N+1 queries per row
        var tankIds = pageResult.getContent().stream().map(TankerDelivery::getTankId).distinct().toList();
        var userIds = pageResult.getContent().stream().map(TankerDelivery::getLoggedByUserId).distinct().toList();
        var tankById = tankRepository.findAllById(tankIds).stream()
                .collect(java.util.stream.Collectors.toMap(UndergroundTank::getId, t -> t));
        var userNameById = userRepository.findAllById(userIds).stream()
                .collect(java.util.stream.Collectors.toMap(User::getId, User::getFullName));

        var mapped = pageResult.map(d ->
                toDeliveryResponse(d, tankById.get(d.getTankId()),
                        userNameById.getOrDefault(d.getLoggedByUserId(), "Unknown")));

        return ResponseEntity.ok(PagedResponse.of(mapped));
    }

    /**
     * POST /api/inventory/{pumpId}/dip-checks
     * Records a physical DIP measurement. Owner/Admin only.
     *
     * The operator physically measures the underground tank with a dipstick and
     * reports the reading (in litres) to the manager. The manager enters it here.
     *
     * What this does:
     * 1. Saves the measured vs. system stock so the variance is on record
     * 2. Updates the tank's current_stock to match the physical measurement
     *    (the physical measurement is ground truth — it overrides the system value)
     */
    @PostMapping("/{pumpId}/dip-checks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<DipCheckResponse> recordDipCheck(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordDipCheckRequest request,
            @AuthenticationPrincipal User currentUser) {

        UndergroundTank tank = tankRepository.findById(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

        if (!tank.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tank does not belong to this pump");
        }

        if (tank.getStatus() == TankStatus.INACTIVE) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' is currently disabled. " +
                    "Re-enable it in Setup before recording a DIP check.");
        }

        BigDecimal systemStockNow = tank.getCurrentStock().setScale(3, RoundingMode.HALF_UP);
        BigDecimal measured = request.getMeasuredQuantity().setScale(3, RoundingMode.HALF_UP);
        BigDecimal variance = measured.subtract(systemStockNow);

        var checkedAt = request.getCheckedAt()
                .atStartOfDay(businessClock.zone())
                .toOffsetDateTime();

        String checkedByName = null;
        if (request.getCheckedByUserId() != null) {
            checkedByName = userRepository.findById(request.getCheckedByUserId())
                    .map(User::getFullName)
                    .orElse(null);
        }

        // Flag above-tolerance variances for Owner/Admin review.
        // Stock is always corrected immediately — the physical measurement is ground truth.
        boolean aboveTolerance = variance.abs().compareTo(tank.getDipTolerance()) > 0;
        DipCheckStatus status = aboveTolerance ? DipCheckStatus.PENDING_REVIEW : DipCheckStatus.WITHIN_TOLERANCE;

        DipCheck check = DipCheck.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .measuredQuantity(measured)
                .systemStock(systemStockNow)
                .notes(request.getNotes())
                .checkedAt(checkedAt)
                .loggedByUserId(currentUser.getId())
                .checkedByUserId(request.getCheckedByUserId())
                .status(status)
                .build();

        check = dipCheckRepository.save(check);

        // Physical measurement is the source of truth — update tank stock immediately
        tank.setCurrentStock(measured);
        tankRepository.save(tank);

        log.info("DIP check recorded: pump={}, tank={}, measured={}L, system={}L, variance={}L, status={}, by={}, checkedBy={}",
                pumpId, tank.getId(), measured, systemStockNow, variance, status, currentUser.getId(), request.getCheckedByUserId());

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toDipCheckResponse(check, tank, currentUser.getFullName(), checkedByName, variance));
    }

    /**
     * PATCH /api/inventory/{pumpId}/dip-checks/{dipCheckId}/review
     * Owner/Admin acknowledges an above-tolerance DIP check.
     * Transitions status from PENDING_REVIEW → REVIEWED.
     * No financial changes — this is an acknowledgement step only.
     */
    @PatchMapping("/{pumpId}/dip-checks/{dipCheckId}/review")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<DipCheckResponse> reviewDipCheck(
            @PathVariable Long pumpId,
            @PathVariable Long dipCheckId,
            @AuthenticationPrincipal User currentUser) {

        DipCheck check = dipCheckRepository.findById(dipCheckId)
                .orElseThrow(() -> new ResourceNotFoundException("DIP check not found"));

        if (!check.getPumpId().equals(pumpId)) {
            throw new BusinessException("DIP check does not belong to this pump");
        }

        if (check.getStatus() != DipCheckStatus.PENDING_REVIEW) {
            throw new BusinessException("DIP check is not pending review (current status: " + check.getStatus() + ")");
        }

        check.setStatus(DipCheckStatus.REVIEWED);
        check.setReviewedByUserId(currentUser.getId());
        check.setReviewedAt(businessClock.now());
        check = dipCheckRepository.save(check);

        UndergroundTank tank = tankRepository.findById(check.getTankId()).orElse(null);
        BigDecimal variance = check.getMeasuredQuantity().subtract(check.getSystemStock());
        String loggedBy  = userRepository.findById(check.getLoggedByUserId()).map(User::getFullName).orElse("Unknown");
        String checkedBy = check.getCheckedByUserId() != null
                ? userRepository.findById(check.getCheckedByUserId()).map(User::getFullName).orElse(null)
                : null;

        log.info("DIP check reviewed: pump={}, dipCheck={}, variance={}L, reviewedBy={}",
                pumpId, dipCheckId, variance, currentUser.getId());

        return ResponseEntity.ok(toDipCheckResponse(check, tank, loggedBy, checkedBy, variance));
    }

    /**
     * GET /api/inventory/{pumpId}/dip-checks?page=0&size=50
     * Returns paginated DIP check history for a pump, newest first.
     */
    @GetMapping("/{pumpId}/dip-checks")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<PagedResponse<DipCheckResponse>> getDipChecks(
            @PathVariable Long pumpId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        var pageResult = dipCheckRepository
                .findByPumpIdOrderByCheckedAtDesc(pumpId, PageRequest.of(page, size));

        // Batch-load user names and tank info to avoid N+1 queries per row
        var tankIds = pageResult.getContent().stream().map(DipCheck::getTankId).distinct().toList();
        var loggedUserIds = pageResult.getContent().stream().map(DipCheck::getLoggedByUserId).distinct().toList();
        var allUserIds = new java.util.HashSet<>(loggedUserIds);
        pageResult.getContent().stream()
                .filter(d -> d.getCheckedByUserId() != null)
                .map(DipCheck::getCheckedByUserId)
                .forEach(allUserIds::add);

        var tankById = tankRepository.findAllById(tankIds).stream()
                .collect(java.util.stream.Collectors.toMap(UndergroundTank::getId, t -> t));
        var userNameById = userRepository.findAllById(allUserIds).stream()
                .collect(java.util.stream.Collectors.toMap(User::getId, User::getFullName));

        var mapped = pageResult.map(d -> {
            UndergroundTank t = tankById.get(d.getTankId());
            String loggedBy = userNameById.getOrDefault(d.getLoggedByUserId(), "Unknown");
            String checkedBy = d.getCheckedByUserId() != null
                    ? userNameById.getOrDefault(d.getCheckedByUserId(), "Unknown")
                    : null;
            BigDecimal variance = d.getMeasuredQuantity().subtract(d.getSystemStock());
            return toDipCheckResponse(d, t, loggedBy, checkedBy, variance);
        });

        return ResponseEntity.ok(PagedResponse.of(mapped));
    }

    // --- helpers ---

    private TankStockResponse toTankStockResponse(UndergroundTank tank) {
        BigDecimal stock    = tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
        BigDecimal capacity = tank.getCapacity();

        BigDecimal pct = capacity.compareTo(BigDecimal.ZERO) > 0
                ? stock.multiply(new BigDecimal("100"))
                       .divide(capacity, 1, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        boolean lowStock = pct.compareTo(new BigDecimal("20")) < 0;

        return TankStockResponse.builder()
                .tankId(tank.getId())
                .tankIdentifier(tank.getTankIdentifier())
                .fuelType(tank.getFuelType().name())
                .capacity(capacity.setScale(3, RoundingMode.HALF_UP))
                .currentStock(stock.setScale(3, RoundingMode.HALF_UP))
                .stockPercentage(pct)
                .lowStock(lowStock)
                .dipTolerance(tank.getDipTolerance())
                .pumpId(tank.getPumpId())
                .status(tank.getStatus().name())
                .build();
    }

    private TankerDeliveryResponse toDeliveryResponse(TankerDelivery d, UndergroundTank tank,
                                                       String loggedByName) {
        BigDecimal totalCost = d.getQuantityDelivered()
                .multiply(d.getCostPricePerUnit())
                .setScale(4, RoundingMode.HALF_UP);

        return TankerDeliveryResponse.builder()
                .id(d.getId())
                .pumpId(d.getPumpId())
                .tankId(d.getTankId())
                .tankIdentifier(tank != null ? tank.getTankIdentifier() : null)
                .fuelType(d.getFuelType().name())
                .quantityDelivered(d.getQuantityDelivered())
                .costPricePerUnit(d.getCostPricePerUnit())
                .totalCost(totalCost)
                .deliveryDate(d.getDeliveryDate())
                .invoiceReference(d.getInvoiceReference())
                .loggedByUserName(loggedByName)
                .createdAt(d.getCreatedAt())
                .build();
    }

    /**
     * GET /api/inventory/{pumpId}/tanks/{tankId}/lots
     * Returns all ACTIVE FIFO inventory lots for a specific tank, oldest first.
     * Exhausted lots are excluded — only remaining stock is shown.
     * Read-only — no row lock. Safe to call without a transaction.
     */
    @GetMapping("/{pumpId}/tanks/{tankId}/lots")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<InventoryLotDetailResponse>> getActiveTankLots(
            @PathVariable Long pumpId,
            @PathVariable Long tankId) {

        UndergroundTank tank = tankRepository.findById(tankId)
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + tankId));

        if (!tank.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tank does not belong to this pump.");
        }

        List<InventoryLot> lots = inventoryLotRepository.findActiveLotsByTankForDisplay(tankId);

        if (lots.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        // Batch-load tanker deliveries to resolve invoiceReference — one query, no N+1.
        // DIP-adjustment lots have tankerDeliveryId = null and are handled gracefully below.
        List<Long> deliveryIds = lots.stream()
                .filter(l -> l.getTankerDeliveryId() != null)
                .map(InventoryLot::getTankerDeliveryId)
                .distinct()
                .toList();

        Map<Long, TankerDelivery> deliveryById = tankerDeliveryRepository.findAllById(deliveryIds)
                .stream()
                .collect(Collectors.toMap(TankerDelivery::getId, Function.identity()));

        List<InventoryLotDetailResponse> response = lots.stream()
                .map(l -> {
                    TankerDelivery delivery = l.getTankerDeliveryId() != null
                            ? deliveryById.get(l.getTankerDeliveryId())
                            : null;
                    return InventoryLotDetailResponse.builder()
                            .id(l.getId())
                            .tankerDeliveryId(l.getTankerDeliveryId())
                            .deliveryDate(l.getDeliveryDate())
                            .invoiceReference(delivery != null ? delivery.getInvoiceReference() : null)
                            .costPricePerUnit(l.getCostPricePerUnit())
                            .remainingQuantity(l.getRemainingQuantity())
                            .originalQuantity(l.getOriginalQuantity())
                            .isDipAdjustment(l.getIsDipAdjustment())
                            .status(l.getStatus().name())
                            .createdAt(l.getCreatedAt())
                            .build();
                })
                .toList();

        return ResponseEntity.ok(response);
    }

    /**
     * Guards against recording a tanker delivery whose cost price per litre is
     * greater than or equal to the current global selling price for that fuel type.
     *
     * Fuel is always purchased at a cost BELOW the pump selling price — that margin
     * is the gross profit. If cost >= selling price the delivery would be entered
     * incorrectly and produce a guaranteed loss on every litre sold.
     *
     * If no global price has been configured for this fuel type yet, the check is
     * skipped so that initial setup (adding stock before prices are set) is not blocked.
     */
    private void validateCostPriceAgainstSellingPrice(Long pumpId, UndergroundTank tank, BigDecimal costPrice) {
        globalFuelPriceRepository
                .findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, tank.getFuelType())
                .map(GlobalFuelPrice::getPricePerUnit)
                .ifPresent(sellingPrice -> {
                    if (costPrice.compareTo(sellingPrice) >= 0) {
                        throw new BusinessException(
                                "Cost price ₹" + costPrice + "/L for " + tank.getFuelType().name() +
                                " must be less than the current selling price ₹" + sellingPrice + "/L. " +
                                "Tanker fuel is always purchased below the pump selling price.");
                    }
                });
    }

    private DipCheckResponse toDipCheckResponse(DipCheck d, UndergroundTank tank,
                                                 String loggedByName, String checkedByName,
                                                 BigDecimal variance) {
        String reviewedByName = null;
        if (d.getReviewedByUserId() != null) {
            reviewedByName = userRepository.findById(d.getReviewedByUserId())
                    .map(User::getFullName).orElse("Unknown");
        }

        return DipCheckResponse.builder()
                .id(d.getId())
                .tankId(d.getTankId())
                .tankIdentifier(tank != null ? tank.getTankIdentifier() : null)
                .fuelType(tank != null ? tank.getFuelType().name() : null)
                .measuredQuantity(d.getMeasuredQuantity())
                .systemStock(d.getSystemStock())
                .variance(variance.setScale(3, RoundingMode.HALF_UP))
                .notes(d.getNotes())
                .checkedAt(d.getCheckedAt())
                .loggedByUserName(loggedByName)
                .checkedByUserName(checkedByName)
                .createdAt(d.getCreatedAt())
                .status(d.getStatus() != null ? d.getStatus().name() : DipCheckStatus.WITHIN_TOLERANCE.name())
                .reviewedAt(d.getReviewedAt())
                .reviewedByUserName(reviewedByName)
                .build();
    }
}
