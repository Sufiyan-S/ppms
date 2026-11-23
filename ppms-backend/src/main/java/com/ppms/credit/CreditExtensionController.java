package com.ppms.credit;

import java.util.Map;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.time.BusinessClock;
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
    private final AuditService auditService;
    private final BusinessClock businessClock;

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
    public ResponseEntity<List<CreditExtension>> getActiveExtensions(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {
        return ResponseEntity.ok(extensionRepository.findInEffect(pumpId, clientId, businessClock.today()));
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

        CreditClient client = clientRepository.findById(clientId)
                .filter(c -> c.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_CLIENT,
                        "Credit client not found at this pump"));
        if (client.getParentClientId() != null) {
            String parentName = clientRepository.findById(client.getParentClientId())
                    .map(CreditClient::getName)
                    .orElse("the parent account");
            throw new BusinessException(ErrorCodes.CREDIT_EXTENSION_ON_SUB_ACCOUNT,
                    Map.of("clientName", client.getName(), "parentName", parentName),
                    "Credit limits and billing cycles of sub-account '" + client.getName()
                    + "' are checked on its parent account '" + parentName
                    + "'. Grant the extension on the parent account instead.");
        }

        // Enforce Business Rule 60: only one active extension of the same type
        extensionRepository.findInEffectOfType(pumpId, clientId, request.extensionType(), businessClock.today())
                .ifPresent(existing -> {
                    throw new BusinessException(ErrorCodes.CREDIT_EXTENSION_ALREADY_ACTIVE,
                            Map.of("extensionTypeCode", request.extensionType().name(),
                                   "expiryDate", String.valueOf(existing.getExpiryDate())),
                            "An active " + request.extensionType() + " already exists for this client (expires "
                            + existing.getExpiryDate() + "). Expire it before creating a new one (Business Rule 60).");
                });

        // AMOUNT_EXTENSION must have an amount
        if (request.extensionType() == CreditExtensionType.AMOUNT_EXTENSION) {
            if (request.extensionAmount() == null || request.extensionAmount().signum() <= 0) {
                throw new BusinessException(ErrorCodes.CREDIT_EXTENSION_AMOUNT_REQUIRED,
                        Map.of(),
                        "AMOUNT_EXTENSION requires a positive extensionAmount.");
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

        auditService.log(pumpId, AuditAction.CREDIT_EXTENSION_GRANTED,
                "CreditExtension", extension.getId().toString(),
                request.extensionType() + " for clientId=" + clientId
                        + (extension.getExtensionAmount() != null ? " of ₹" + extension.getExtensionAmount() : "")
                        + " granted until " + extension.getExpiryDate() + ", reason=" + extension.getReason(),
                currentUser);
        log.info("Credit extension granted: pumpId={}, clientId={}, type={}, expiry={}, by={}",
                pumpId, clientId, request.extensionType(), request.expiryDate(), currentUser.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(extension);
    }

    /**
     * POST /api/pumps/{pumpId}/credit-clients/{clientId}/extensions/{extensionId}/revoke
     * Withdraws an active extension before it expires; the row stays with who revoked it and why.
     */
    @PostMapping("/{extensionId}/revoke")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    @Transactional
    public ResponseEntity<CreditExtension> revokeExtension(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @PathVariable Long extensionId,
            @Valid @RequestBody RevokeCreditExtensionRequest request,
            @AuthenticationPrincipal User currentUser) {

        CreditExtension extension = extensionRepository.findByIdForUpdate(extensionId)
                .filter(found -> found.getPumpId().equals(pumpId) && found.getClientId().equals(clientId))
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.CREDIT_EXTENSION,
                        "Credit extension not found"));
        if (extension.getStatus() != CreditExtensionStatus.ACTIVE) {
            throw new BusinessException(ErrorCodes.CREDIT_EXTENSION_NOT_ACTIVE,
                    Map.of("statusCode", extension.getStatus().name()),
                    "Only an active extension can be revoked; this one is " + extension.getStatus() + ".");
        }

        extension.setStatus(CreditExtensionStatus.REVOKED);
        extension.setRevokedAt(businessClock.now());
        extension.setRevokedByUserId(currentUser.getId());
        extension.setRevokeReason(request.reason().trim());
        extension = extensionRepository.save(extension);

        auditService.log(pumpId, AuditAction.CREDIT_EXTENSION_REVOKED,
                "CreditExtension", extensionId.toString(),
                extension.getExtensionType() + " for clientId=" + clientId + " (expiring " + extension.getExpiryDate()
                        + ") revoked, reason=" + extension.getRevokeReason(),
                currentUser);
        log.info("Credit extension revoked: pumpId={}, clientId={}, extensionId={}, by={}",
                pumpId, clientId, extensionId, currentUser.getId());

        return ResponseEntity.ok(extension);
    }
}
