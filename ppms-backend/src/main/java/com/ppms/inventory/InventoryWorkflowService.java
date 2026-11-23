package com.ppms.inventory;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.report.BalanceSheetStalenessService;
import com.ppms.report.StaleReasons;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Tanker deliveries and dip checks. Every method that changes a tank's currentStock locks the tank row first.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InventoryWorkflowService {

    private static final BigDecimal TANKER_CAPACITY_TOLERANCE = new BigDecimal("0.5");

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
    private final InventoryResponseAssembler responseAssembler;
    private final OpenShiftMeterService openShiftMeterService;
    private final DipCheckNozzleReadingRepository dipCheckNozzleReadingRepository;
    private final TankLotConsumptionService tankLotConsumptionService;
    private final LotCostCorrectionService lotCostCorrectionService;
    private final BalanceSheetStalenessService balanceSheetStalenessService;

    /**
     * Records one tanker delivery: a TankerDelivery row, a FIFO InventoryLot, and the added tank stock.
     */
    @Transactional
    public TankerDeliveryResponse recordDelivery(Long pumpId, RecordDeliveryRequest request, User currentUser) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));
        assertTankUsable(tank, pumpId, "recording a delivery");
        assertCapacity(tank, request.getQuantityDelivered());

        String invoiceRef = request.getInvoiceReference() != null ? request.getInvoiceReference().trim() : null;
        if (invoiceRef != null && !invoiceRef.isBlank()) {
            assertInvoiceNotRecorded(pumpId, invoiceRef, tank);
        }
        if (currentUser.getRole() != UserRole.MANAGER && request.getCostPricePerUnit() == null) {
            throw new BusinessException(ErrorCodes.COST_PRICE_REQUIRED, Map.of(),
                    "Cost price per unit is required");
        }
        BigDecimal costPrice = costPriceForDelivery(tank, request.getCostPricePerUnit(), currentUser);
        validateCostPriceAgainstSellingPrice(pumpId, tank, costPrice);

        TankerDelivery delivery = createDeliveryWithLot(pumpId, tank, request.getQuantityDelivered(),
                costPrice, startOfBusinessDay(request.getDeliveryDate()), invoiceRef,
                request.getBillTotal(), null, currentUser);

        log.info("Tanker delivery recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                pumpId, tank.getId(), tank.getFuelType(),
                request.getQuantityDelivered(), request.getInvoiceReference(), currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_RECORDED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery: " + tank.getFuelType() + " " + request.getQuantityDelivered() + "L to tank " +
                tank.getTankIdentifier() + " at ₹" + costPrice + "/L, invoice=" +
                request.getInvoiceReference(),
                currentUser);

        return responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName());
    }

    /**
     * Records every line of one tanker trip atomically, so a failing line leaves no tank partly updated.
     * Without a cost price, a line reuses the tank's last delivery cost; a manager can never send one.
     */
    @Transactional
    public List<TankerDeliveryResponse> recordBatchDelivery(Long pumpId, RecordBatchDeliveryRequest request, User currentUser) {
        OffsetDateTime deliveryDateTime = startOfBusinessDay(request.getDeliveryDate());
        String invoiceRef = request.getInvoiceReference().trim();

        Set<Long> tankIds = new HashSet<>();
        for (RecordBatchDeliveryRequest.LineItem item : request.getItems()) {
            if (!tankIds.add(item.getTankId())) {
                throw new BusinessException(ErrorCodes.BATCH_TANK_REPEATED,
                        Map.of("tankId", String.valueOf(item.getTankId())),
                        "Tank ID " + item.getTankId() + " appears more than once in this batch. " +
                        "Each tank can only receive one delivery per batch.");
            }
        }

        Tanker tanker = request.getTankerId() != null ? findTankerMatchingQuantity(pumpId, request) : null;

        tankRepository.findAllByIdForUpdate(tankIds);

        List<TankerDeliveryResponse> responses = new ArrayList<>();
        for (RecordBatchDeliveryRequest.LineItem item : request.getItems()) {
            UndergroundTank tank = tankRepository.findById(item.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK,
                            "Tank not found: " + item.getTankId()));
            if (!tank.getPumpId().equals(pumpId)) {
                throw new ResourceNotFoundException(EntityType.TANK, "Tank " + item.getTankId() + " not found");
            }
            assertTankUsable(tank, pumpId, "recording a delivery");
            assertCapacity(tank, item.getQuantityDelivered());
            assertInvoiceNotRecorded(pumpId, invoiceRef, tank);

            BigDecimal costPrice = costPriceForDelivery(tank, item.getCostPricePerUnit(), currentUser);
            validateCostPriceAgainstSellingPrice(pumpId, tank, costPrice);

            TankerDelivery delivery = createDeliveryWithLot(pumpId, tank, item.getQuantityDelivered(), costPrice,
                    deliveryDateTime, invoiceRef, request.getBillTotal(), tanker, currentUser);

            log.info("Batch delivery item recorded: pump={}, tank={}, fuel={}, qty={}L, invoice={}, by={}",
                    pumpId, tank.getId(), tank.getFuelType(), delivery.getQuantityDelivered(), invoiceRef, currentUser.getId());

            responses.add(responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName()));
        }
        return responses;
    }

    /**
     * Corrects a delivery and its lot, moving tank stock by the quantity change.
     * The new quantity can never go below what shifts have already consumed from the lot.
     */
    @Transactional
    public TankerDeliveryResponse updateDelivery(Long pumpId, Long deliveryId, UpdateDeliveryRequest request, User currentUser) {
        TankerDelivery delivery = tankerDeliveryRepository.findById(deliveryId)
                .filter(found -> found.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DELIVERY, "Delivery not found"));

        UndergroundTank tank = tankRepository.findByIdForUpdate(delivery.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));
        InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(deliveryId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.STOCK_LOT,
                        "Inventory lot not found for this delivery"));

        BigDecimal consumed = lot.getOriginalQuantity().subtract(lot.getRemainingQuantity());
        BigDecimal newQty = request.getQuantityDelivered().setScale(3, RoundingMode.HALF_UP);
        if (newQty.compareTo(consumed) < 0) {
            throw new BusinessException(ErrorCodes.DELIVERY_QUANTITY_BELOW_CONSUMED,
                    Map.of("newQuantity", newQty.toPlainString(),
                           "consumedQuantity", consumed.setScale(3, RoundingMode.HALF_UP).toPlainString()),
                    "Cannot reduce quantity to " + newQty + "L — " + consumed.setScale(3, RoundingMode.HALF_UP) +
                    "L of this lot has already been consumed. New quantity must be at least " +
                    consumed.setScale(3, RoundingMode.HALF_UP) + "L.");
        }

        String invoiceRef = request.getInvoiceReference().trim();
        List<TankerDelivery> otherInvoiceLines = otherLinesOfInvoice(pumpId, delivery);
        assertInvoiceFreeForLines(pumpId, invoiceRef, delivery, otherInvoiceLines);

        BigDecimal oldQty = lot.getOriginalQuantity();
        BigDecimal deltaQty = newQty.subtract(oldQty);
        BigDecimal newStock = tank.getCurrentStock().add(deltaQty).setScale(3, RoundingMode.HALF_UP);
        if (newStock.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(ErrorCodes.DELIVERY_REDUCTION_MAKES_STOCK_NEGATIVE, Map.of(),
                    "Reducing this delivery would bring tank stock below zero.");
        }
        tank.setCurrentStock(newStock);
        tankRepository.save(tank);

        OffsetDateTime newDeliveryDateTime = startOfBusinessDay(request.getDeliveryDate());
        assertDeliveryNotAfterFirstUse(lot, newDeliveryDateTime);
        if (currentUser.getRole() == UserRole.MANAGER && request.getCostPricePerUnit() != null) {
            throw new AccessDeniedException("Only an owner or admin can change the fuel purchase cost.");
        }
        BigDecimal costPrice = request.getCostPricePerUnit() != null
                ? request.getCostPricePerUnit()
                : delivery.getCostPricePerUnit();

        BigDecimal oldCostPrice = lot.getCostPricePerUnit();
        BigDecimal newRemaining = lot.getRemainingQuantity().add(deltaQty).setScale(3, RoundingMode.HALF_UP);
        lot.setOriginalQuantity(newQty);
        lot.setRemainingQuantity(newRemaining);
        lot.setStatus(newRemaining.compareTo(BigDecimal.ZERO) > 0 ? LotStatus.ACTIVE : LotStatus.EXHAUSTED);
        lot.setCostPricePerUnit(costPrice);
        lot.setDeliveryDate(newDeliveryDateTime);
        inventoryLotRepository.save(lot);

        delivery.setQuantityDelivered(newQty);
        delivery.setCostPricePerUnit(costPrice);
        delivery.setDeliveryDate(newDeliveryDateTime);
        delivery.setInvoiceReference(invoiceRef);
        delivery = tankerDeliveryRepository.save(delivery);
        moveOtherInvoiceLines(otherInvoiceLines, invoiceRef, newDeliveryDateTime);
        if (costPrice.compareTo(oldCostPrice) != 0) {
            lotCostCorrectionService.recostConsumedFuel(pumpId, lot, oldCostPrice, costPrice, delivery, currentUser);
        }

        log.info("Delivery updated: pump={}, delivery={}, fuel={}, oldQty={}L, newQty={}L, invoice={}, by={}",
                pumpId, deliveryId, delivery.getFuelType(), oldQty, newQty, invoiceRef, currentUser.getId());

        auditService.log(pumpId, AuditAction.DELIVERY_UPDATED,
                "TankerDelivery", delivery.getId().toString(),
                "Delivery updated: " + delivery.getFuelType() + " qty " + oldQty + "→" + newQty + "L, " +
                "cost ₹" + costPrice + "/L, invoice=" + invoiceRef,
                currentUser);

        return responseAssembler.toDeliveryResponse(delivery, tank, currentUser.getFullName());
    }

    /**
     * Deletes the most recently entered invoice (all its tank lines) and reverses the tank stock.
     * The caller names the invoice it showed, so a newer entry made meanwhile is never deleted by mistake.
     * Refused once any fuel from the invoice has been consumed by a shift.
     */
    @Transactional
    public void deleteLatestDelivery(Long pumpId, String expectedInvoiceReference, User currentUser) {
        TankerDelivery latest = tankerDeliveryRepository.findTopByPumpIdOrderByCreatedAtDesc(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DELIVERY,
                        "No deliveries found for this pump"));

        String invoiceRef = latest.getInvoiceReference();
        if (!expectedInvoiceReference.trim().equals(invoiceRef)) {
            throw new BusinessException(ErrorCodes.INVOICE_NOT_LATEST,
                    Map.of("invoiceReference", expectedInvoiceReference.trim(), "laterInvoiceReference", invoiceRef),
                    "Invoice '" + expectedInvoiceReference.trim() + "' is not the most recently entered invoice — '" +
                    invoiceRef + "' was entered after it. Only the latest entered invoice can be deleted; " +
                    "reload the delivery history and try again.");
        }
        List<TankerDelivery> toDelete = tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, invoiceRef);
        tankRepository.findAllByIdForUpdate(toDelete.stream().map(TankerDelivery::getTankId).toList());

        List<InventoryLot> lots = new ArrayList<>();
        for (TankerDelivery delivery : toDelete) {
            InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(delivery.getId())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.STOCK_LOT,
                            "Inventory lot not found for delivery " + delivery.getId()));
            if (lot.getRemainingQuantity().compareTo(lot.getOriginalQuantity()) < 0) {
                throw new BusinessException(ErrorCodes.INVOICE_FUEL_ALREADY_CONSUMED,
                        Map.of(),
                        "This invoice cannot be deleted — fuel from it has already been consumed in a shift. " +
                        "Use Edit to correct quantities instead.");
            }
            lots.add(lot);
        }

        BigDecimal totalQty = BigDecimal.ZERO;
        StringBuilder detail = new StringBuilder("Deleted invoice '").append(invoiceRef).append("': ");
        for (int i = 0; i < toDelete.size(); i++) {
            TankerDelivery delivery = toDelete.get(i);
            UndergroundTank tank = tankRepository.findById(delivery.getTankId())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK,
                            "Tank not found: " + delivery.getTankId()));

            tank.setCurrentStock(tank.getCurrentStock()
                    .subtract(delivery.getQuantityDelivered())
                    .setScale(3, RoundingMode.HALF_UP));
            tankRepository.save(tank);

            inventoryLotRepository.delete(lots.get(i));
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

        auditService.log(pumpId, AuditAction.DELIVERY_DELETED, "TankerDelivery", invoiceRef, detail.toString(), currentUser);
    }

    /**
     * Records a physical dip measurement for today. The measurement is ground truth: the tank and its lot ledger
     * move by the variance at once. Fuel already sold on shifts still open has not left stock yet, so it is taken
     * off the expected stock first, from the meter readings entered with the check. Above-tolerance variances are
     * flagged for review.
     */
    @Transactional
    public DipCheckResponse recordDipCheck(Long pumpId, RecordDipCheckRequest request, User currentUser) {
        UndergroundTank tank = tankRepository.findByIdForUpdate(request.getTankId())
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.TANK, "Tank not found"));
        assertTankUsable(tank, pumpId, "recording a DIP check");
        assertCheckedToday(request.getCheckedAt());

        if (currentStockOf(tank).compareTo(BigDecimal.ZERO) == 0 && !tankerDeliveryRepository.existsByTankId(tank.getId())) {
            throw new BusinessException(ErrorCodes.TANK_HAS_NO_DELIVERY,
                    Map.of("tankIdentifier", tank.getTankIdentifier()),
                    "Tank '" + tank.getTankIdentifier() + "' has never received a delivery. " +
                    "Record a tanker delivery first before performing a DIP check.");
        }

        List<DipCheckNozzleReading> openShiftSales = openShiftMeterService.salesSinceShiftOpen(tank, request.getNozzleReadings());
        BigDecimal soldOnOpenShifts = openShiftSales.stream()
                .map(DipCheckNozzleReading::getUnitsSold)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal systemStockNow = currentStockOf(tank).subtract(soldOnOpenShifts).setScale(3, RoundingMode.HALF_UP);
        BigDecimal measured = request.getMeasuredQuantity().setScale(3, RoundingMode.HALF_UP);
        BigDecimal variance = measured.subtract(systemStockNow);
        OffsetDateTime checkedAt = businessClock.now();

        String checkedByName = null;
        if (request.getCheckedByUserId() != null) {
            checkedByName = userRepository.findById(request.getCheckedByUserId())
                    .filter(user -> pumpId.equals(user.getAssignedPumpId()))
                    .map(User::getFullName)
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.USER, "Checked-by user not found"));
        }

        boolean aboveTolerance = variance.abs().compareTo(tank.getDipTolerance()) > 0;
        DipCheckStatus status = aboveTolerance ? DipCheckStatus.PENDING_REVIEW : DipCheckStatus.WITHIN_TOLERANCE;

        DipCheck check = dipCheckRepository.save(DipCheck.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .measuredQuantity(measured)
                .systemStock(systemStockNow)
                .notes(request.getNotes())
                .checkedAt(checkedAt)
                .loggedByUserId(currentUser.getId())
                .checkedByUserId(request.getCheckedByUserId())
                .status(status)
                .build());
        openShiftSales.forEach(reading -> reading.setDipCheckId(check.getId()));
        dipCheckNozzleReadingRepository.saveAll(openShiftSales);

        // Open shifts deduct their full sales at close, so the tank keeps what they sold until then.
        tank.setCurrentStock(currentStockOf(tank).add(variance).setScale(3, RoundingMode.HALF_UP));
        tankRepository.save(tank);

        applyDipAdjustment(pumpId, tank, check, variance, checkedAt);
        balanceSheetStalenessService.markAllSheetsStale(pumpId, List.of(businessClock.today()),
                StaleReasons.dipCheckRecorded(tank.getTankIdentifier()));

        log.info("DIP check recorded: pump={}, tank={}, measured={}L, system={}L, soldOnOpenShifts={}L, variance={}L, status={}, by={}, checkedBy={}",
                pumpId, tank.getId(), measured, systemStockNow, soldOnOpenShifts, variance, status, currentUser.getId(),
                request.getCheckedByUserId());

        return responseAssembler.toDipCheckResponse(check, tank, currentUser.getFullName(), checkedByName, null);
    }

    /** Acknowledges an above-tolerance dip check (PENDING_REVIEW → REVIEWED). No stock or money changes. */
    @Transactional
    public DipCheckResponse reviewDipCheck(Long pumpId, Long dipCheckId, User currentUser) {
        DipCheck check = dipCheckRepository.findById(dipCheckId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.DIP_CHECK, "DIP check not found"));
        if (!check.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.DIP_CHECK, "DIP check not found");
        }
        if (check.getStatus() != DipCheckStatus.PENDING_REVIEW) {
            throw new BusinessException(ErrorCodes.DIP_CHECK_NOT_PENDING_REVIEW,
                    Map.of("statusCode", String.valueOf(check.getStatus())),
                    "DIP check is not pending review (current status: " + check.getStatus() + ")");
        }

        check.setStatus(DipCheckStatus.REVIEWED);
        check.setReviewedByUserId(currentUser.getId());
        check.setReviewedAt(businessClock.now());
        check = dipCheckRepository.save(check);

        UndergroundTank tank = tankRepository.findById(check.getTankId()).orElse(null);
        String loggedBy = userRepository.findById(check.getLoggedByUserId()).map(User::getFullName).orElse("Unknown");
        String checkedBy = check.getCheckedByUserId() != null
                ? userRepository.findById(check.getCheckedByUserId()).map(User::getFullName).orElse(null)
                : null;

        log.info("DIP check reviewed: pump={}, dipCheck={}, variance={}L, reviewedBy={}",
                pumpId, dipCheckId, check.getMeasuredQuantity().subtract(check.getSystemStock()), currentUser.getId());

        return responseAssembler.toDipCheckResponse(check, tank, loggedBy, checkedBy, currentUser.getFullName());
    }

    /**
     * Keeps the lot ledger equal to the corrected stock: a gain becomes a dip-adjustment lot, a loss is
     * consumed from the oldest lots. Without this, shift-close FIFO would disagree with the tank.
     */
    private void applyDipAdjustment(Long pumpId, UndergroundTank tank, DipCheck check,
                                    BigDecimal variance, OffsetDateTime checkedAt) {
        if (variance.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal gain = variance.setScale(3, RoundingMode.HALF_UP);
            BigDecimal adjustmentCost = costForDipGain(pumpId, tank);
            inventoryLotRepository.save(InventoryLot.builder()
                    .tankerDeliveryId(null)
                    .tankId(tank.getId())
                    .fuelType(tank.getFuelType())
                    .pumpId(pumpId)
                    .originalQuantity(gain)
                    .remainingQuantity(gain)
                    .costPricePerUnit(adjustmentCost)
                    .deliveryDate(checkedAt)
                    .isDipAdjustment(true)
                    .dipCheckId(check.getId())
                    .status(LotStatus.ACTIVE)
                    .build());
            log.info("DIP adjustment lot created: pump={}, tank={}, +{}L at cost {}",
                    pumpId, tank.getId(), gain, adjustmentCost);
            return;
        }
        if (variance.compareTo(BigDecimal.ZERO) == 0) {
            return;
        }

        List<LotConsumption> consumptions = tankLotConsumptionService.consumeOldestFirst(
                tank, variance.abs(), LotConsumptionSource.DIP_CORRECTION);
        consumptions.forEach(consumption -> consumption.setDipCorrectionId(check.getId()));
        lotConsumptionRepository.saveAll(consumptions);
        log.info("DIP adjustment: FIFO-consumed {}L from lots, tank={}, pump={}",
                variance.abs().setScale(3, RoundingMode.HALF_UP), tank.getId(), pumpId);
    }

    /**
     * Extra fuel found by a dip check is valued at the latest real purchase cost, never at zero. Dip-adjustment
     * and synthetic lots are skipped because they carry a copied or zero cost.
     */
    private BigDecimal costForDipGain(Long pumpId, UndergroundTank tank) {
        return inventoryLotRepository.findActiveLotsByTankForDisplay(tank.getId())
                .stream()
                .filter(InventoryWorkflowService::hasRealPurchaseCost)
                .reduce((first, second) -> second)
                .or(() -> inventoryLotRepository
                        .findFirstByPumpIdAndFuelTypeAndIsDipAdjustmentFalseOrderByDeliveryDateDesc(pumpId, tank.getFuelType())
                        .filter(InventoryWorkflowService::hasRealPurchaseCost))
                .map(InventoryLot::getCostPricePerUnit)
                .orElseThrow(() -> new BusinessException(ErrorCodes.DIP_GAIN_HAS_NO_PURCHASE_COST,
                        Map.of("fuelTypeCode", tank.getFuelType().name()),
                        "No " + tank.getFuelType() + " delivery has been recorded for this pump, so the extra fuel " +
                        "found by this dip check has no purchase cost. Record a tanker delivery first."));
    }

    private TankerDelivery createDeliveryWithLot(Long pumpId, UndergroundTank tank, BigDecimal quantity,
                                                 BigDecimal costPrice, OffsetDateTime deliveryDateTime,
                                                 String invoiceRef, BigDecimal billTotal, Tanker tanker,
                                                 User currentUser) {
        BigDecimal qty = quantity.setScale(3, RoundingMode.HALF_UP);
        TankerDelivery delivery = tankerDeliveryRepository.save(TankerDelivery.builder()
                .pumpId(pumpId)
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .quantityDelivered(qty)
                .costPricePerUnit(costPrice)
                .deliveryDate(deliveryDateTime)
                .invoiceReference(invoiceRef)
                .billTotal(billTotal != null ? billTotal.setScale(2, RoundingMode.HALF_UP) : null)
                .tankerId(tanker != null ? tanker.getId() : null)
                .tankerName(tanker != null ? tanker.getName() : null)
                .loggedByUserId(currentUser.getId())
                .build());

        inventoryLotRepository.save(InventoryLot.builder()
                .tankerDeliveryId(delivery.getId())
                .tankId(tank.getId())
                .fuelType(tank.getFuelType())
                .pumpId(pumpId)
                .originalQuantity(qty)
                .remainingQuantity(qty)
                .costPricePerUnit(costPrice)
                .deliveryDate(deliveryDateTime)
                .isDipAdjustment(false)
                .status(LotStatus.ACTIVE)
                .build());

        tank.setCurrentStock(currentStockOf(tank).add(qty).setScale(3, RoundingMode.HALF_UP));
        tankRepository.save(tank);
        return delivery;
    }

    private Tanker findTankerMatchingQuantity(Long pumpId, RecordBatchDeliveryRequest request) {
        Tanker tanker = tankerRepository.findById(request.getTankerId())
                .orElseThrow(() -> new BusinessException(ErrorCodes.TANKER_NOT_FOUND,
                        Map.of("tankerId", request.getTankerId()),
                        "Tanker not found: " + request.getTankerId()));
        if (!tanker.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.TANKER, "Tanker not found");
        }
        BigDecimal totalQty = request.getItems().stream()
                .map(RecordBatchDeliveryRequest.LineItem::getQuantityDelivered)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalQty.subtract(tanker.getCapacityLitres()).abs().compareTo(TANKER_CAPACITY_TOLERANCE) > 0) {
            throw new BusinessException(ErrorCodes.TANKER_QUANTITY_MISMATCH,
                    Map.of("totalQuantity", totalQty.setScale(2, RoundingMode.HALF_UP).toPlainString(),
                           "tankerName", tanker.getName(),
                           "tankerCapacity", tanker.getCapacityLitres().setScale(2, RoundingMode.HALF_UP).toPlainString()),
                    "Total quantity " + totalQty.setScale(2, RoundingMode.HALF_UP) + "L does not match tanker '" +
                    tanker.getName() + "' capacity of " +
                    tanker.getCapacityLitres().setScale(2, RoundingMode.HALF_UP) + "L. " +
                    "Adjust the quantities so they add up to the tanker's capacity.");
        }
        return tanker;
    }

    private void assertTankUsable(UndergroundTank tank, Long pumpId, String activity) {
        if (!tank.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException(EntityType.TANK, "Tank not found");
        }
        if (tank.getStatus() == TankStatus.INACTIVE) {
            throw new BusinessException("recording a DIP check".equals(activity) ? ErrorCodes.TANK_DISABLED_FOR_DIP_CHECK : ErrorCodes.TANK_DISABLED_FOR_DELIVERY,
                    Map.of("tankIdentifier", tank.getTankIdentifier()),
                    "Tank '" + tank.getTankIdentifier() + "' is currently disabled. " +
                    "Re-enable it in Setup before " + activity + ".");
        }
    }

    /** Rejects a delivery that would overflow the tank's physical capacity, a common data-entry mistake. */
    private void assertCapacity(UndergroundTank tank, BigDecimal quantity) {
        BigDecimal currentStock = currentStockOf(tank);
        BigDecimal availableCapacity = tank.getCapacity().subtract(currentStock).setScale(3, RoundingMode.HALF_UP);
        if (quantity.compareTo(availableCapacity) > 0) {
            throw new BusinessException(ErrorCodes.DELIVERY_OVERFLOWS_TANK,
                    Map.of("tankIdentifier", tank.getTankIdentifier(),
                           "availableCapacity", availableCapacity.toPlainString(),
                           "capacity", tank.getCapacity().setScale(3, RoundingMode.HALF_UP).toPlainString(),
                           "currentStock", currentStock.setScale(3, RoundingMode.HALF_UP).toPlainString(),
                           "quantity", quantity.setScale(3, RoundingMode.HALF_UP).toPlainString()),
                    "Tank '" + tank.getTankIdentifier() + "' has only " + availableCapacity + "L of available capacity " +
                    "(capacity: " + tank.getCapacity().setScale(3, RoundingMode.HALF_UP) + "L, current stock: " +
                    currentStock.setScale(3, RoundingMode.HALF_UP) + "L). " +
                    "Delivery of " + quantity.setScale(3, RoundingMode.HALF_UP) + "L would overflow the tank.");
        }
    }

    /** Lines of a batch invoice share its reference and date, so an edit to either moves the whole invoice. */
    private List<TankerDelivery> otherLinesOfInvoice(Long pumpId, TankerDelivery delivery) {
        if (delivery.getInvoiceReference() == null) {
            return List.of();
        }
        return tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, delivery.getInvoiceReference()).stream()
                .filter(line -> !line.getId().equals(delivery.getId()))
                .toList();
    }

    private void assertInvoiceFreeForLines(Long pumpId, String invoiceRef, TankerDelivery delivery,
                                           List<TankerDelivery> otherInvoiceLines) {
        List<TankerDelivery> movingLines = new ArrayList<>(otherInvoiceLines);
        movingLines.add(delivery);
        Set<Long> movingIds = new HashSet<>();
        movingLines.forEach(line -> movingIds.add(line.getId()));
        for (TankerDelivery line : movingLines) {
            boolean takenOutsideInvoice = tankerDeliveryRepository.findByPumpIdAndInvoiceReference(pumpId, invoiceRef).stream()
                    .anyMatch(existing -> existing.getTankId().equals(line.getTankId()) && !movingIds.contains(existing.getId()));
            if (takenOutsideInvoice) {
                throw new BusinessException(ErrorCodes.INVOICE_SAME_TANK_ALREADY_RECORDED,
                        Map.of("invoiceReference", invoiceRef),
                        "Invoice '" + invoiceRef + "' already has a delivery to the same tank recorded for this pump. " +
                        "Use a different invoice reference.");
            }
        }
    }

    private void moveOtherInvoiceLines(List<TankerDelivery> otherInvoiceLines, String invoiceRef, OffsetDateTime deliveryDateTime) {
        for (TankerDelivery line : otherInvoiceLines) {
            InventoryLot lineLot = inventoryLotRepository.findByTankerDeliveryId(line.getId())
                    .orElseThrow(() -> new ResourceNotFoundException(EntityType.STOCK_LOT,
                            "Inventory lot not found for delivery " + line.getId()));
            assertDeliveryNotAfterFirstUse(lineLot, deliveryDateTime);
            lineLot.setDeliveryDate(deliveryDateTime);
            inventoryLotRepository.save(lineLot);
            line.setInvoiceReference(invoiceRef);
            line.setDeliveryDate(deliveryDateTime);
            tankerDeliveryRepository.save(line);
        }
    }

    /**
     * Purchase cost drives stock valuation and profit, so only an owner or admin may enter it;
     * a delivery without a cost reuses the tank's last delivery cost.
     */
    private BigDecimal costPriceForDelivery(UndergroundTank tank, BigDecimal requestedCost, User currentUser) {
        if (currentUser.getRole() == UserRole.MANAGER && requestedCost != null) {
            throw new AccessDeniedException("Only an owner or admin can set the fuel purchase cost.");
        }
        if (requestedCost != null) {
            return requestedCost;
        }
        return tankerDeliveryRepository.findTopByTankIdOrderByDeliveryDateDescCreatedAtDesc(tank.getId())
                .map(TankerDelivery::getCostPricePerUnit)
                .orElseThrow(() -> new BusinessException(ErrorCodes.FIRST_COST_PRICE_NEEDS_OWNER,
                        Map.of("tankIdentifier", tank.getTankIdentifier()),
                        "No earlier delivery found for tank '" + tank.getTankIdentifier() +
                        "' — an owner or admin must enter the first cost price."));
    }

    /** Same invoice + tank is a double entry; the DB unique index is the final safety net. */
    private void assertInvoiceNotRecorded(Long pumpId, String invoiceRef, UndergroundTank tank) {
        if (tankerDeliveryRepository.existsByPumpIdAndInvoiceReferenceAndTankId(pumpId, invoiceRef, tank.getId())) {
            throw new BusinessException(ErrorCodes.INVOICE_ALREADY_RECORDED_FOR_TANK,
                    Map.of("invoiceReference", invoiceRef, "tankIdentifier", tank.getTankIdentifier()),
                    "Invoice '" + invoiceRef + "' already has a delivery to tank '" + tank.getTankIdentifier() +
                    "' recorded for this pump. Check the invoice number or use a different reference.");
        }
    }

    /**
     * Fuel is always bought below the pump selling price; a cost at or above it is a data-entry mistake.
     * Skipped while no selling price is configured, so initial stock can be entered before prices.
     */
    private void validateCostPriceAgainstSellingPrice(Long pumpId, UndergroundTank tank, BigDecimal costPrice) {
        globalFuelPriceRepository
                .findFirstByPumpIdAndFuelTypeOrderByEffectiveFromDesc(pumpId, tank.getFuelType())
                .map(GlobalFuelPrice::getPricePerUnit)
                .ifPresent(sellingPrice -> {
                    if (costPrice.compareTo(sellingPrice) >= 0) {
                        throw new BusinessException(ErrorCodes.COST_PRICE_NOT_BELOW_SELLING_PRICE,
                                Map.of("costPrice", costPrice.toPlainString(),
                                       "fuelTypeCode", tank.getFuelType().name(),
                                       "sellingPrice", sellingPrice.toPlainString()),
                                "Cost price ₹" + costPrice + "/L for " + tank.getFuelType().name() +
                                " must be less than the current selling price ₹" + sellingPrice + "/L. " +
                                "Tanker fuel is always purchased below the pump selling price.");
                    }
                });
    }

    private static boolean hasRealPurchaseCost(InventoryLot lot) {
        return !Boolean.TRUE.equals(lot.getIsDipAdjustment())
                && lot.getCostPricePerUnit() != null
                && lot.getCostPricePerUnit().compareTo(BigDecimal.ZERO) > 0;
    }

    /** Moving a delivery after the time its fuel was first used would make earlier days' stock negative. */
    private void assertDeliveryNotAfterFirstUse(InventoryLot lot, OffsetDateTime newDeliveryDateTime) {
        if (!newDeliveryDateTime.isAfter(lot.getDeliveryDate())) {
            return;
        }
        lotConsumptionRepository.findFirstConsumptionTime(lot.getId())
                .filter(firstUse -> newDeliveryDateTime.isAfter(firstUse))
                .ifPresent(firstUse -> {
                    throw new BusinessException(ErrorCodes.DELIVERY_DATE_AFTER_FIRST_USE,
                            Map.of("newDeliveryDate", newDeliveryDateTime.atZoneSameInstant(businessClock.zone()).toLocalDate().toString(),
                                   "firstUseDate", firstUse.atZoneSameInstant(businessClock.zone()).toLocalDate().toString()),
                            "Cannot move this delivery to " + newDeliveryDateTime.atZoneSameInstant(businessClock.zone()).toLocalDate() +
                            " — its fuel was already used on " + firstUse.atZoneSameInstant(businessClock.zone()).toLocalDate() +
                            ". Choose a date on or before the first use.");
                });
    }

    /** A dip check sets the tank to what is in it now, so one dated any other day would overwrite today's stock. */
    private void assertCheckedToday(LocalDate checkedOn) {
        LocalDate today = businessClock.today();
        if (checkedOn != null && !checkedOn.equals(today)) {
            throw new BusinessException(ErrorCodes.DIP_CHECK_ONLY_TODAY,
                    Map.of("today", today.toString(), "checkedOn", checkedOn.toString()),
                    "A DIP check can only be recorded for today (" + today + "). A check dated " + checkedOn +
                    " would overwrite today's tank stock with an older measurement.");
        }
    }

    private OffsetDateTime startOfBusinessDay(LocalDate date) {
        return date.atStartOfDay(businessClock.zone()).toOffsetDateTime();
    }

    private static BigDecimal currentStockOf(UndergroundTank tank) {
        return tank.getCurrentStock() != null ? tank.getCurrentStock() : BigDecimal.ZERO;
    }
}
