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
import java.util.ArrayList;
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
    private final LotConsumptionRepository lotConsumptionRepository;
    private final DipCheckRepository dipCheckRepository;
    private final UserRepository userRepository;
    private final GlobalFuelPriceRepository globalFuelPriceRepository;
    private final TankerRepository tankerRepository;
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
                .billTotal(request.getBillTotal() != null ? request.getBillTotal().setScale(2, RoundingMode.HALF_UP) : null)
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

        // Guard 2: if a tanker is selected, total quantity must equal its capacity (±0.5 L tolerance).
        Tanker selectedTanker = null;
        if (request.getTankerId() != null) {
            selectedTanker = tankerRepository.findById(request.getTankerId())
                    .orElseThrow(() -> new BusinessException("Tanker not found: " + request.getTankerId()));
            if (!selectedTanker.getPumpId().equals(pumpId)) {
                throw new BusinessException("Tanker does not belong to this pump");
            }
            BigDecimal totalQty = request.getItems().stream()
                    .map(RecordBatchDeliveryRequest.LineItem::getQuantityDelivered)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal diff = totalQty.subtract(selectedTanker.getCapacityLitres()).abs();
            if (diff.compareTo(new BigDecimal("0.5")) > 0) {
                throw new BusinessException(
                        "Total quantity " + totalQty.setScale(2, RoundingMode.HALF_UP) + "L does not match tanker '" +
                        selectedTanker.getName() + "' capacity of " +
                        selectedTanker.getCapacityLitres().setScale(2, RoundingMode.HALF_UP) + "L. " +
                        "Adjust the quantities so they add up to the tanker's capacity.");
            }
        }
        final Tanker finalTanker = selectedTanker;

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

            // Resolve cost price: use provided value, or fall back to the last delivery for this tank.
            BigDecimal resolvedCost;
            if (item.getCostPricePerUnit() != null) {
                resolvedCost = item.getCostPricePerUnit();
            } else {
                resolvedCost = tankerDeliveryRepository
                        .findTopByTankIdOrderByDeliveryDateDescCreatedAtDesc(tank.getId())
                        .map(TankerDelivery::getCostPricePerUnit)
                        .orElseThrow(() -> new BusinessException(
                                "No previous delivery found for tank '" + tank.getTankIdentifier() +
                                "' — cost price is required for the first entry. Please ask an Owner or Admin to record it."));
            }

            validateCostPriceAgainstSellingPrice(pumpId, tank, resolvedCost);

            BigDecimal qty = item.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP);

            BigDecimal batchBillTotal = request.getBillTotal() != null
                    ? request.getBillTotal().setScale(2, RoundingMode.HALF_UP)
                    : null;

            TankerDelivery delivery = TankerDelivery.builder()
                    .pumpId(pumpId)
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .quantityDelivered(qty)
                    .costPricePerUnit(resolvedCost)
                    .deliveryDate(deliveryDateTime)
                    .invoiceReference(invoiceRef)
                    .billTotal(batchBillTotal)
                    .tankerId(finalTanker != null ? finalTanker.getId() : null)
                    .tankerName(finalTanker != null ? finalTanker.getName() : null)
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
                    .costPricePerUnit(resolvedCost)
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
     * PATCH /api/inventory/{pumpId}/deliveries/{deliveryId}
     * Corrects a previously recorded tanker delivery. Owner/Admin only.
     *
     * What this does:
     * 1. Updates the TankerDelivery record (invoice ref, qty, cost, date)
     * 2. Syncs the corresponding InventoryLot (cost price, delivery date)
     * 3. Adjusts lot quantities and tank current_stock by the qty delta
     *
     * Constraint: new quantity must be >= already-consumed quantity (originalQty - remainingQty).
     * Reducing below what's been sold would make stock tracking inconsistent.
     */
    @PatchMapping("/{pumpId}/deliveries/{deliveryId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<TankerDeliveryResponse> updateDelivery(
            @PathVariable Long pumpId,
            @PathVariable Long deliveryId,
            @Valid @RequestBody UpdateDeliveryRequest request,
            @AuthenticationPrincipal User currentUser) {

        TankerDelivery delivery = tankerDeliveryRepository.findById(deliveryId)
                .orElseThrow(() -> new ResourceNotFoundException("Delivery not found"));

        if (!delivery.getPumpId().equals(pumpId)) {
            throw new BusinessException("Delivery does not belong to this pump");
        }

        UndergroundTank tank = tankRepository.findById(delivery.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException("Tank not found"));

        InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(deliveryId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory lot not found for this delivery"));

        // Prevent reducing quantity below what has already been consumed via FIFO deductions
        BigDecimal consumed = lot.getOriginalQuantity().subtract(lot.getRemainingQuantity());
        BigDecimal newQty = request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP);
        if (newQty.compareTo(consumed) < 0) {
            throw new BusinessException(
                    "Cannot reduce quantity to " + newQty + "L — " + consumed.setScale(3, RoundingMode.HALF_UP) +
                    "L of this lot has already been consumed. New quantity must be at least " +
                    consumed.setScale(3, RoundingMode.HALF_UP) + "L.");
        }

        // Duplicate invoice guard — same invoice + same fuel type + same pump on a DIFFERENT delivery
        String invoiceRefTrimmed = request.getInvoiceReference().trim();
        if (tankerDeliveryRepository.existsByPumpIdAndInvoiceReferenceAndFuelTypeAndIdNot(
                pumpId, invoiceRefTrimmed, delivery.getFuelType(), deliveryId)) {
            throw new BusinessException(
                    "Invoice '" + invoiceRefTrimmed + "' already has a " + delivery.getFuelType().name() +
                    " delivery recorded for this pump. Use a different invoice reference.");
        }

        // Adjust tank stock by the quantity delta
        BigDecimal oldQty = lot.getOriginalQuantity();
        BigDecimal deltaQty = newQty.subtract(oldQty);
        BigDecimal newStock = tank.getCurrentStock().add(deltaQty).setScale(3, RoundingMode.HALF_UP);
        if (newStock.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("Reducing this delivery would bring tank stock below zero.");
        }
        tank.setCurrentStock(newStock);
        tankRepository.save(tank);

        // Sync InventoryLot
        var newDeliveryDateTime = request.getDeliveryDate()
                .atStartOfDay(businessClock.zone())
                .toOffsetDateTime();
        // When cost is null (manager edit), preserve the existing price
        BigDecimal resolvedCost = request.getCostPricePerUnit() != null
                ? request.getCostPricePerUnit()
                : delivery.getCostPricePerUnit();

        lot.setOriginalQuantity(newQty);
        lot.setRemainingQuantity(lot.getRemainingQuantity().add(deltaQty).setScale(3, RoundingMode.HALF_UP));
        lot.setCostPricePerUnit(resolvedCost);
        lot.setDeliveryDate(newDeliveryDateTime);
        inventoryLotRepository.save(lot);

        // Update the TankerDelivery record
        delivery.setQuantityDelivered(newQty);
        delivery.setCostPricePerUnit(resolvedCost);
        delivery.setDeliveryDate(newDeliveryDateTime);
        delivery.setInvoiceReference(invoiceRefTrimmed);
        delivery = tankerDeliveryRepository.save(delivery);

        log.info("Delivery updated: pump={}, delivery={}, fuel={}, oldQty={}L, newQty={}L, invoice={}, by={}",
                pumpId, deliveryId, delivery.getFuelType(), oldQty, newQty, invoiceRefTrimmed, currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_RECORDED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery updated: " + delivery.getFuelType() + " qty " + oldQty + "→" + newQty + "L, " +
                "cost ₹" + resolvedCost + "/L, invoice=" + invoiceRefTrimmed,
                currentUser);

        String loggedByName = currentUser.getFullName();
        return ResponseEntity.ok(toDeliveryResponse(delivery, tank, loggedByName));
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

        if (tank.getCurrentStock().compareTo(BigDecimal.ZERO) == 0) {
            throw new BusinessException(
                    "Tank '" + tank.getTankIdentifier() + "' has no recorded stock. " +
                    "Record a tanker delivery first before performing a DIP check.");
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

        // Keep InventoryLot ledger in sync with the corrected stock.
        // Without this, a positive DIP check would show fuel in the tank but have no
        // active lots — causing shift-close FIFO to report 0 L available.
        if (variance.compareTo(BigDecimal.ZERO) > 0) {
            // Physical stock is HIGHER — create a DIP-adjustment lot for the delta
            BigDecimal adjustmentCost = inventoryLotRepository.findActiveLotsByTankForDisplay(tank.getId())
                    .stream()
                    .reduce((a, b) -> b)
                    .map(InventoryLot::getCostPricePerUnit)
                    .orElse(BigDecimal.ZERO);
            InventoryLot adjustmentLot = InventoryLot.builder()
                    .tankerDeliveryId(null)
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .pumpId(pumpId)
                    .originalQuantity(variance.setScale(3, RoundingMode.HALF_UP))
                    .remainingQuantity(variance.setScale(3, RoundingMode.HALF_UP))
                    .costPricePerUnit(adjustmentCost)
                    .deliveryDate(checkedAt)
                    .isDipAdjustment(true)
                    .status(LotStatus.ACTIVE)
                    .build();
            inventoryLotRepository.save(adjustmentLot);
            log.info("DIP adjustment lot created: pump={}, tank={}, +{}L at cost {}",
                    pumpId, tank.getId(), variance.setScale(3, RoundingMode.HALF_UP), adjustmentCost);

        } else if (variance.compareTo(BigDecimal.ZERO) < 0) {
            // Physical stock is LOWER — FIFO-consume the negative delta from active lots
            BigDecimal toDeduct = variance.abs();
            List<InventoryLot> lots = inventoryLotRepository.findActiveLotsByTankFifo(tank.getId());
            List<InventoryLot> touchedLots = new ArrayList<>();
            List<LotConsumption> consumptions = new ArrayList<>();
            for (InventoryLot lot : lots) {
                if (toDeduct.compareTo(BigDecimal.ZERO) <= 0) break;
                BigDecimal consume = toDeduct.min(lot.getRemainingQuantity());
                lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(consume).setScale(3, RoundingMode.HALF_UP));
                if (lot.getRemainingQuantity().compareTo(BigDecimal.ZERO) == 0) {
                    lot.setStatus(LotStatus.EXHAUSTED);
                }
                touchedLots.add(lot);
                consumptions.add(LotConsumption.builder()
                        .lotId(lot.getId())
                        .sourceType(LotConsumptionSource.DIP_CORRECTION)
                        .dipCorrectionId(check.getId())
                        .quantityConsumed(consume)
                        .costPricePerUnit(lot.getCostPricePerUnit())
                        .build());
                toDeduct = toDeduct.subtract(consume);
            }
            inventoryLotRepository.saveAll(touchedLots);
            lotConsumptionRepository.saveAll(consumptions);
            log.info("DIP adjustment: FIFO-consumed {}L from lots, tank={}, pump={}",
                    variance.abs().setScale(3, RoundingMode.HALF_UP), tank.getId(), pumpId);
        }

        log.info("DIP check recorded: pump={}, tank={}, measured={}L, system={}L, variance={}L, status={}, by={}, checkedBy={}",
                pumpId, tank.getId(), measured, systemStockNow, variance, status, currentUser.getId(), request.getCheckedByUserId());

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toDipCheckResponse(check, tank, currentUser.getFullName(), checkedByName, variance, null));
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

        return ResponseEntity.ok(toDipCheckResponse(check, tank, loggedBy, checkedBy, variance, currentUser.getFullName()));
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
        var allUserIds = new java.util.HashSet<Long>();
        pageResult.getContent().forEach(d -> {
            allUserIds.add(d.getLoggedByUserId());
            if (d.getCheckedByUserId()  != null) allUserIds.add(d.getCheckedByUserId());
            if (d.getReviewedByUserId() != null) allUserIds.add(d.getReviewedByUserId());
        });

        var tankById = tankRepository.findAllById(tankIds).stream()
                .collect(java.util.stream.Collectors.toMap(UndergroundTank::getId, t -> t));
        var userNameById = userRepository.findAllById(allUserIds).stream()
                .collect(java.util.stream.Collectors.toMap(User::getId, User::getFullName));

        var mapped = pageResult.map(d -> {
            UndergroundTank t = tankById.get(d.getTankId());
            String loggedBy    = userNameById.getOrDefault(d.getLoggedByUserId(), "Unknown");
            String checkedBy   = d.getCheckedByUserId()  != null ? userNameById.getOrDefault(d.getCheckedByUserId(),  "Unknown") : null;
            String reviewedBy  = d.getReviewedByUserId() != null ? userNameById.getOrDefault(d.getReviewedByUserId(), "Unknown") : null;
            BigDecimal variance = d.getMeasuredQuantity().subtract(d.getSystemStock());
            return toDipCheckResponse(d, t, loggedBy, checkedBy, variance, reviewedBy);
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
                .billTotal(d.getBillTotal())
                .tankerName(d.getTankerName())
                .deliveryDate(d.getDeliveryDate())
                .invoiceReference(d.getInvoiceReference())
                .loggedByUserName(loggedByName)
                .createdAt(d.getCreatedAt())
                .build();
    }

    /**
     * DELETE /api/inventory/{pumpId}/deliveries/latest
     * Deletes the most recently recorded invoice, covering all TankerDelivery rows
     * that share its invoiceReference (handles batch deliveries across multiple tanks).
     *
     * Blocked if any fuel from the invoice has been consumed (remaining < original in any lot).
     * On success: deletes each InventoryLot, reverses tank stock, deletes TankerDelivery rows.
     *
     * "Latest" is by createdAt DESC — the most recently entered record, not necessarily
     * the most recent delivery date — so an old-dated correction entered today is still deletable.
     */
    @DeleteMapping("/{pumpId}/deliveries/latest")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLatestDelivery(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {

        TankerDelivery latest = tankerDeliveryRepository.findTopByPumpIdOrderByCreatedAtDesc(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException("No deliveries found for this pump"));

        String invoiceRef = latest.getInvoiceReference();
        List<TankerDelivery> toDelete = tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, invoiceRef);

        // Block deletion if any lot from this invoice has been consumed by a shift
        for (TankerDelivery delivery : toDelete) {
            InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(delivery.getId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Inventory lot not found for delivery " + delivery.getId()));
            if (lot.getRemainingQuantity().compareTo(lot.getOriginalQuantity()) < 0) {
                throw new BusinessException(
                        "This invoice cannot be deleted — fuel from it has already been consumed in a shift. " +
                        "Use Edit to correct quantities instead.");
            }
        }

        // All lots untouched — delete everything and reverse tank stocks
        BigDecimal totalQty = BigDecimal.ZERO;
        StringBuilder detail = new StringBuilder("Deleted invoice '").append(invoiceRef).append("': ");

        for (TankerDelivery delivery : toDelete) {
            InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(delivery.getId()).get();
            UndergroundTank tank = tankRepository.findById(delivery.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException("Tank not found: " + delivery.getTankId()));

            BigDecimal newStock = tank.getCurrentStock()
                    .subtract(delivery.getQuantityDelivered())
                    .setScale(3, RoundingMode.HALF_UP);
            tank.setCurrentStock(newStock);
            tankRepository.save(tank);

            inventoryLotRepository.delete(lot);
            tankerDeliveryRepository.delete(delivery);

            totalQty = totalQty.add(delivery.getQuantityDelivered());
            detail.append(tank.getTankIdentifier()).append(" -")
                  .append(delivery.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP)).append("L ")
                  .append(delivery.getFuelType()).append(", ");
        }

        detail.append("Total: -").append(totalQty.setScale(3, RoundingMode.HALF_UP)).append("L");

        log.info("Invoice deleted: pump={}, invoice='{}', deliveries=[{}], by={}",
                pumpId, invoiceRef,
                toDelete.stream().map(d -> d.getId().toString()).collect(Collectors.joining(",")),
                currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_DELETED,
                "TankerDelivery", invoiceRef,
                detail.toString(),
                currentUser);
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
                                                 BigDecimal variance, String reviewedByName) {
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
