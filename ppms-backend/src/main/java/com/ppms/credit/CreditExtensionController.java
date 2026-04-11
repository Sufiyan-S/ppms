package com.ppms.credit;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Credit Extension endpoints — temporary overrides for credit limit blocks and billing cycle blocks.
 * Spec: Section 3.6, Business Rules 51, 58, 59, 60.
 *
 * Base URL: /api/pumps/{pumpId}/credit-clients/{clientId}/extensions
 */
@Slf4j
@RestController
@RequestMapping("/api/pumps/{pumpId}/credit-clients/{clientId}/extensions")
@RequiredArgsConstructor
public class CreditExtensionController {

    private final CreditExtensionRepository extensionRepository;
    private final CreditClientRepository clientRepository;

    /**
     * GET /api/pumps/{pumpId}/credit-clients/{clientId}/extensions
     * Returns all extensions for a client at this pump, newest first.
     */
    @GetMapping
    public ResponseEntity<List<CreditExtension>> listExtensions(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {
        return ResponseEntity.ok(
                extensionRepository.findByPumpIdAndClientIdOrderByCreatedAtDesc(pumpId, clientId));
    }

    /**
     * GET /api/pumps/{pumpId}/credit-clients/{clientId}/extensions/active
     * Returns all currently active (non-expired) extensions for a client.
     * Used by the frontend to show the active extension banner and by ShiftService
     * to suppress credit blocks when an extension is in effect.
     */
    @GetMapping("/active")
    @Transactional
    public ResponseEntity<List<CreditExtension>> getActiveExtensions(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {
        // Expire any whose date has passed before returning
        extensionRepository.expireOverdueExtensions(LocalDate.now());
        return ResponseEntity.ok(
                extensionRepository.findByPumpIdAndClientIdAndStatus(pumpId, clientId, CreditExtensionStatus.ACTIVE));
    }

    /**
     * POST /api/pumps/{pumpId}/credit-clients/{clientId}/extensions
     * Grants a new credit extension. Admin or Owner only (spec Section 2 capability table).
     *
     * Rules enforced:
     * - Expiry date must be in the future (Business Rule 58).
     * - AMOUNT_EXTENSION requires extensionAmount > 0.
     * - Only one active extension of each type per client per pump (Business Rule 60).
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    @Transactional
    public ResponseEntity<CreditExtension> createExtension(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @Valid @RequestBody CreateCreditExtensionRequest request,
            @AuthenticationPrincipal User currentUser) {

        // Verify client exists at this pump
        clientRepository.findById(clientId)
                .filter(c -> c.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Credit client not found at this pump"));

        // Enforce Business Rule 60: only one active extension of the same type
        extensionRepository.findByPumpIdAndClientIdAndExtensionTypeAndStatus(
                pumpId, clientId, request.extensionType(), CreditExtensionStatus.ACTIVE)
                .ifPresent(existing -> {
                    throw new BusinessException(
                            "An active " + request.extensionType() + " already exists for this client (expires "
                            + existing.getExpiryDate() + "). Expire it before creating a new one (Business Rule 60).");
                });

        // AMOUNT_EXTENSION must have an amount
        if (request.extensionType() == CreditExtensionType.AMOUNT_EXTENSION) {
            if (request.extensionAmount() == null || request.extensionAmount().signum() <= 0) {
                throw new BusinessException("AMOUNT_EXTENSION requires a positive extensionAmount.");
            }
        }

        CreditExtension extension = CreditExtension.builder()
                .pumpId(pumpId)
                .clientId(clientId)
                .extensionType(request.extensionType())
                .extensionAmount(request.extensionAmount())
                .expiryDate(request.expiryDate())
                .grantedByUserId(currentUser.getId())
                .reason(request.reason().trim())
                .status(CreditExtensionStatus.ACTIVE)
                .build();

        extension = extensionRepository.save(extension);

        log.info("Credit extension granted: pumpId={}, clientId={}, type={}, expiry={}, by={}",
                pumpId, clientId, request.extensionType(), request.expiryDate(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(extension);
    }
}
