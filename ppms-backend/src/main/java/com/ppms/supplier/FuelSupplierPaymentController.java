package com.ppms.supplier;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * REST controller for recording fuel supplier payments.
 *
 * GET  /api/pumps/{pumpId}/supplier-payments                   — list all payments
 * GET  /api/pumps/{pumpId}/supplier-payments?supplierId={id}   — filter by supplier
 * POST /api/pumps/{pumpId}/supplier-payments                   — record a new payment
 *
 * Payments track amounts sent to fuel suppliers — either against a specific tanker
 * delivery or as an advance/bulk payment. This enables tracking of outstanding dues.
 *
 * Only OWNER and ADMIN can record and view supplier payments.
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/supplier-payments")
@RequiredArgsConstructor
public class FuelSupplierPaymentController {

    private final FuelSupplierPaymentRepository paymentRepository;
    private final FuelSupplierRepository supplierRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    /**
     * GET /api/pumps/{pumpId}/supplier-payments
     * Returns all supplier payments for a pump, newest first.
     * Optional supplierId query param to filter by a specific supplier.
     */
    @GetMapping
    public ResponseEntity<List<SupplierPaymentResponse>> getPayments(
            @PathVariable Long pumpId,
            @RequestParam(required = false) Long supplierId) {

        List<FuelSupplierPayment> payments = supplierId != null
                ? paymentRepository.findByPumpIdAndSupplierIdOrderByPaymentDateDesc(pumpId, supplierId)
                : paymentRepository.findByPumpIdOrderByPaymentDateDescCreatedAtDesc(pumpId);

        // Batch-load supplier names and user names
        Set<Long> supplierIds = payments.stream().map(FuelSupplierPayment::getSupplierId).collect(Collectors.toSet());
        Map<Long, String> supplierNameById = supplierRepository.findAllById(supplierIds).stream()
                .collect(Collectors.toMap(FuelSupplier::getId, FuelSupplier::getName));

        Set<Long> userIds = payments.stream().map(FuelSupplierPayment::getRecordedByUserId).collect(Collectors.toSet());
        Map<Long, String> userNameById = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getFullName));

        return ResponseEntity.ok(payments.stream()
                .map(p -> toResponse(p, supplierNameById.getOrDefault(p.getSupplierId(), "Unknown"),
                        userNameById.getOrDefault(p.getRecordedByUserId(), "Unknown")))
                .toList());
    }

    /**
     * POST /api/pumps/{pumpId}/supplier-payments
     * Records a payment made to a fuel supplier.
     * The payment may be linked to a specific tanker delivery or left unlinked (advance payment).
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<SupplierPaymentResponse> recordPayment(
            @PathVariable Long pumpId,
            @Valid @RequestBody RecordSupplierPaymentRequest request,
            @AuthenticationPrincipal User currentUser) {

        requireOwnerOrAdmin(currentUser);

        FuelSupplier supplier = supplierRepository.findById(request.supplierId())
                .orElseThrow(() -> new ResourceNotFoundException("Supplier not found"));

        FuelSupplierPayment payment = FuelSupplierPayment.builder()
                .pumpId(pumpId)
                .supplierId(request.supplierId())
                .deliveryId(request.deliveryId())
                .amount(request.amount().setScale(2, RoundingMode.HALF_UP))
                .paymentDate(request.paymentDate())
                .paymentMode(request.paymentMode())
                .referenceNo(request.referenceNo())
                .notes(request.notes())
                .recordedByUserId(currentUser.getId())
                .build();

        FuelSupplierPayment saved = paymentRepository.save(payment);

        log.info("Supplier payment recorded: pump={} supplier={} amount={} mode={} ref={} by={}",
                pumpId, request.supplierId(), request.amount(), request.paymentMode(),
                request.referenceNo(), currentUser.getId());

        auditService.log(pumpId, AuditAction.SUPPLIER_PAYMENT_RECORDED,
                "FuelSupplierPayment", saved.getId().toString(),
                "Payment ₹" + request.amount() + " to " + supplier.getName() +
                " (" + request.paymentMode() + ")" +
                (request.referenceNo() != null ? " ref=" + request.referenceNo() : ""),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toResponse(saved, supplier.getName(), currentUser.getFullName()));
    }

    private void requireOwnerOrAdmin(User user) {
        if (user.getRole() != UserRole.OWNER && user.getRole() != UserRole.ADMIN
                && user.getRole() != UserRole.SUPER_ADMIN) {
            throw new BusinessException("Only Owner or Admin can manage supplier payments.");
        }
    }

    private SupplierPaymentResponse toResponse(FuelSupplierPayment p,
                                                String supplierName,
                                                String recordedByName) {
        return SupplierPaymentResponse.builder()
                .id(p.getId())
                .pumpId(p.getPumpId())
                .supplierId(p.getSupplierId())
                .supplierName(supplierName)
                .deliveryId(p.getDeliveryId())
                .amount(p.getAmount())
                .paymentDate(p.getPaymentDate())
                .paymentMode(p.getPaymentMode().name())
                .referenceNo(p.getReferenceNo())
                .notes(p.getNotes())
                .recordedByUserId(p.getRecordedByUserId())
                .recordedByName(recordedByName)
                .createdAt(p.getCreatedAt())
                .build();
    }
}
