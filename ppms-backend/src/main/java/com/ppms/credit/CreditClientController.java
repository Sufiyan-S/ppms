package com.ppms.credit;

import com.ppms.common.exception.BusinessException;
import com.ppms.shift.ShiftCreditEntryRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/pumps/{pumpId}/credit-clients")
@RequiredArgsConstructor
public class CreditClientController {

    private final CreditClientRepository creditClientRepository;
    private final CreditPaymentRepository creditPaymentRepository;
    private final ShiftCreditEntryRepository creditEntryRepository;
    private final CreditInterestService interestService;

    /**
     * GET /api/pumps/{pumpId}/credit-clients
     * Returns all credit clients for a pump, sorted by name (parents first, then sub-accounts).
     * Each response includes hierarchy metadata: parentClientId, parentClientName, isParent.
     * All authenticated users can read — operators need the list to select from when closing a shift.
     */
    @GetMapping
    public ResponseEntity<List<CreditClientResponse>> getClients(@PathVariable Long pumpId) {
        List<CreditClient> allClients = creditClientRepository.findByPumpIdOrderByNameAsc(pumpId);

        // Build a name-by-ID map for resolving parent names without N+1 queries
        Map<Long, String> nameById = allClients.stream()
                .collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));

        // Determine which root accounts actually have sub-accounts
        Set<Long> idsWithChildren = allClients.stream()
                .filter(c -> c.getParentClientId() != null)
                .map(CreditClient::getParentClientId)
                .collect(Collectors.toSet());

        List<CreditClientResponse> clients = allClients.stream()
                .map(c -> toResponse(c, nameById, idsWithChildren))
                .sorted(Comparator
                        // Active clients first, disabled last
                        .comparing((CreditClientResponse r) -> Boolean.TRUE.equals(r.getIsActive()) ? 0 : 1)
                        .thenComparing(CreditClientResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(CreditClientResponse::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();

        return ResponseEntity.ok(clients);
    }

    /**
     * POST /api/pumps/{pumpId}/credit-clients
     * Creates a new credit client for a pump.
     * If parentClientId is provided, the new client becomes a sub-account (max 1 level deep).
     * Restricted to OWNER and ADMIN.
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditClientResponse> createClient(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateCreditClientRequest request) {

        String trimmedName = request.getName().trim();
        Long parentClientId = request.getParentClientId();

        if (parentClientId == null) {
            // Root client — name must be unique per pump among root accounts
            if (creditClientRepository.existsByPumpIdAndNameIgnoreCaseAndParentClientIdIsNull(pumpId, trimmedName)) {
                throw new BusinessException("A client named \"" + trimmedName + "\" already exists.");
            }
        } else {
            // Sub-account — validate parent first, then check uniqueness within that parent
            CreditClient parent = creditClientRepository.findById(parentClientId)
                    .orElseThrow(() -> new BusinessException("Parent client not found"));
            if (!parent.getPumpId().equals(pumpId)) {
                throw new BusinessException("Parent client does not belong to this pump");
            }
            if (parent.getParentClientId() != null) {
                throw new BusinessException("Cannot create a sub-account under another sub-account. Only one level of nesting is allowed.");
            }
            if (creditClientRepository.existsByParentClientIdAndNameIgnoreCase(parentClientId, trimmedName)) {
                throw new BusinessException("A sub-account named \"" + trimmedName + "\" already exists under this parent.");
            }
        }

        // Phone uniqueness: within a group (parent + its sub-accounts) phones may be shared;
        // across groups they must be unique.
        String phone = request.getPhone() != null && !request.getPhone().isBlank() ? request.getPhone().trim() : null;
        if (phone != null) {
            boolean conflict = (parentClientId == null)
                    // Root client being created — no group yet, any existing match is a conflict
                    ? creditClientRepository.existsByPumpIdAndPhone(pumpId, phone)
                    // Sub-account — only conflict if the phone belongs to a client outside this group
                    : creditClientRepository.existsPhoneConflictForSubAccount(pumpId, phone, parentClientId);
            if (conflict) {
                throw new BusinessException("Phone number " + phone + " is already registered to another client group in this pump.");
            }
        }

        CreditClient client = CreditClient.builder()
                .pumpId(pumpId)
                .name(trimmedName)
                .phone(phone)
                .notes(request.getNotes())
                .creditLimit(BigDecimal.ZERO) // credit limit lives on the parent account
                .parentClientId(parentClientId)
                .build();

        client = creditClientRepository.save(client);

        Map<Long, String> nameById = creditClientRepository.findByPumpIdOrderByNameAsc(pumpId)
                .stream().collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));
        Set<Long> idsWithChildren = creditClientRepository.findByParentClientId(client.getId()).isEmpty()
                ? Set.of()
                : Set.of(client.getId());

        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(client, nameById, idsWithChildren));
    }

    /**
     * PATCH /api/pumps/{pumpId}/credit-clients/{clientId}
     * Updates name, phone, and/or notes for a credit client. Owner/Admin only.
     * Only non-null fields in the request are applied.
     * Name uniqueness is re-enforced if the name is being changed.
     */
    @PatchMapping("/{clientId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditClientResponse> updateClient(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @Valid @RequestBody UpdateCreditClientRequest request) {

        CreditClient client = creditClientRepository.findById(clientId)
                .orElseThrow(() -> new BusinessException("Credit client not found"));

        if (!client.getPumpId().equals(pumpId)) {
            throw new BusinessException("Client does not belong to this pump");
        }

        if (request.name() != null) {
            String trimmedName = request.name().trim();
            if (!trimmedName.equalsIgnoreCase(client.getName())) {
                if (client.getParentClientId() == null) {
                    // Root client — name must be unique per pump among root accounts
                    if (creditClientRepository.existsByPumpIdAndNameIgnoreCaseAndParentClientIdIsNull(pumpId, trimmedName)) {
                        throw new BusinessException("A client named \"" + trimmedName + "\" already exists.");
                    }
                } else {
                    // Sub-account — name must be unique within the same parent
                    if (creditClientRepository.existsByParentClientIdAndNameIgnoreCase(client.getParentClientId(), trimmedName)) {
                        throw new BusinessException("A sub-account named \"" + trimmedName + "\" already exists under this parent.");
                    }
                }
            }
            client.setName(trimmedName);
        }
        if (request.phone() != null) {
            String trimmedPhone = request.phone().trim();
            String newPhone = trimmedPhone.isEmpty() ? null : trimmedPhone;
            if (newPhone != null) {
                boolean conflict = (client.getParentClientId() == null)
                        // Root client update — conflict if phone belongs to a client outside this root's group
                        ? creditClientRepository.existsPhoneConflictForRootClientUpdate(pumpId, newPhone, clientId)
                        // Sub-account update — conflict if phone belongs to a client outside this group
                        : creditClientRepository.existsPhoneConflictForSubAccount(pumpId, newPhone, client.getParentClientId());
                if (conflict) {
                    throw new BusinessException("Phone number " + newPhone + " is already registered to another client group in this pump.");
                }
            }
            client.setPhone(newPhone);
        }
        if (request.notes() != null) {
            client.setNotes(request.notes().trim().isEmpty() ? null : request.notes().trim());
        }

        client = creditClientRepository.save(client);

        Map<Long, String> nameById = creditClientRepository.findByPumpIdOrderByNameAsc(pumpId)
                .stream().collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));
        Set<Long> idsWithChildren = creditClientRepository.findByParentClientId(client.getId()).stream()
                .map(CreditClient::getId)
                .collect(Collectors.toSet());
        // For the updated client: check if it has children
        boolean hasChildren = !creditClientRepository.findByParentClientId(clientId).isEmpty();

        return ResponseEntity.ok(toResponse(client, nameById, hasChildren ? Set.of(clientId) : Set.of()));
    }

    /**
     * PATCH /api/pumps/{pumpId}/credit-clients/{clientId}/status
     * Enables or disables a credit client (soft toggle). Owner/Admin/Manager only.
     * Disabled clients are hidden from shift credit-entry dropdowns and shown at the
     * bottom of the Clients list. All historical data (ledger, entries) is preserved.
     * Disabling a parent also implicitly hides it from dropdowns — sub-accounts retain
     * their own individual active flags.
     */
    @PatchMapping("/{clientId}/status")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<CreditClientResponse> toggleStatus(
            @PathVariable Long pumpId,
            @PathVariable Long clientId,
            @RequestBody Map<String, Boolean> body) {

        Boolean active = body.get("isActive");
        if (active == null) throw new com.ppms.common.exception.BusinessException("isActive is required");

        CreditClient client = creditClientRepository.findById(clientId)
                .orElseThrow(() -> new com.ppms.common.exception.BusinessException("Credit client not found"));

        if (!client.getPumpId().equals(pumpId)) {
            throw new com.ppms.common.exception.BusinessException("Client does not belong to this pump");
        }

        client.setActive(active);
        client = creditClientRepository.save(client);

        Map<Long, String> nameById = creditClientRepository.findByPumpIdOrderByNameAsc(pumpId)
                .stream().collect(Collectors.toMap(CreditClient::getId, CreditClient::getName));
        boolean hasChildren = !creditClientRepository.findByParentClientId(clientId).isEmpty();

        return ResponseEntity.ok(toResponse(client, nameById, hasChildren ? Set.of(clientId) : Set.of()));
    }

    /**
     * DELETE /api/pumps/{pumpId}/credit-clients/{clientId}
     * Removes a credit client. Restricted to OWNER and ADMIN.
     * Blocked if the client has sub-accounts — remove those first.
     * Note: deleting a client does NOT remove historical credit entries;
     * those store the name as a string and are not affected by deletion.
     */
    @DeleteMapping("/{clientId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<Void> deleteClient(
            @PathVariable Long pumpId,
            @PathVariable Long clientId) {

        CreditClient client = creditClientRepository.findById(clientId)
                .orElseThrow(() -> new BusinessException("Credit client not found"));

        if (!client.getPumpId().equals(pumpId)) {
            throw new BusinessException("Client does not belong to this pump");
        }

        // Prevent orphaning sub-accounts
        List<CreditClient> children = creditClientRepository.findByParentClientId(clientId);
        if (!children.isEmpty()) {
            throw new BusinessException(
                    "Cannot remove a parent account that has sub-accounts. " +
                    "Please remove all sub-accounts first.");
        }

        creditClientRepository.deleteById(clientId);
        return ResponseEntity.noContent().build();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Builds a CreditClientResponse, populating hierarchy metadata.
     *
     * @param c               the client entity
     * @param nameById        pre-loaded name map for the pump (avoids N+1 parent name lookups)
     * @param idsWithChildren set of client IDs that have at least one sub-account
     */
    private CreditClientResponse toResponse(CreditClient c, Map<Long, String> nameById, Set<Long> idsWithChildren) {
        // For parent accounts: outstanding includes all children's balances
        // For child (sub-account) or standalone accounts: own outstanding only
        boolean isParent = c.getParentClientId() == null && idsWithChildren.contains(c.getId());
        BigDecimal outstanding = isParent
                ? interestService.computeOutstandingWithChildren(c.getId())
                : interestService.computeOutstanding(c.getId());

        return CreditClientResponse.builder()
                .id(c.getId())
                .pumpId(c.getPumpId())
                .name(c.getName())
                .phone(c.getPhone())
                .notes(c.getNotes())
                .creditLimit(c.getCreditLimit())
                .outstandingBalance(outstanding)
                .monthlyInterestRate(c.getMonthlyInterestRate())
                .interestGraceDays(c.getInterestGraceDays())
                .createdAt(c.getCreatedAt())
                .parentClientId(c.getParentClientId())
                .parentClientName(c.getParentClientId() != null ? nameById.get(c.getParentClientId()) : null)
                .isParent(isParent)
                .isActive(c.isActive())
                .build();
    }
}
