package com.ppms.supplier;

import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class SupplierController {

    private final FuelSupplierRepository supplierRepository;

    /**
     * GET /api/pumps/{pumpId}/suppliers
     * Returns all active suppliers for a pump, alphabetically sorted.
     */
    @GetMapping("/{pumpId}/suppliers")
    public List<FuelSupplier> getSuppliers(
            @PathVariable Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);
        return supplierRepository.findByPumpIdAndActiveTrueOrderByNameAsc(pumpId);
    }

    /**
     * POST /api/pumps/{pumpId}/suppliers
     * Creates a new supplier for the pump.
     */
    @PostMapping("/{pumpId}/suppliers")
    @ResponseStatus(HttpStatus.CREATED)
    public FuelSupplier createSupplier(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpsertSupplierRequest req,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);

        FuelSupplier supplier = FuelSupplier.builder()
                .pumpId(pumpId)
                .name(req.getName().trim())
                .contactName(req.getContactName())
                .phone(req.getPhone())
                .email(req.getEmail())
                .notes(req.getNotes())
                .build();

        return supplierRepository.save(supplier);
    }

    /**
     * PUT /api/pumps/{pumpId}/suppliers/{supplierId}
     * Updates an existing supplier's details.
     */
    @PutMapping("/{pumpId}/suppliers/{supplierId}")
    public FuelSupplier updateSupplier(
            @PathVariable Long pumpId,
            @PathVariable Long supplierId,
            @Valid @RequestBody UpsertSupplierRequest req,
            @AuthenticationPrincipal User currentUser) {
        requireOwnerOrAdmin(currentUser);

        FuelSupplier supplier = supplierRepository.findById(supplierId)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier not found"));

        supplier.setName(req.getName().trim());
        supplier.setContactName(req.getContactName());
        supplier.setPhone(req.getPhone());
        supplier.setEmail(req.getEmail());
        supplier.setNotes(req.getNotes());

        return supplierRepository.save(supplier);
    }

    /**
     * DELETE /api/pumps/{pumpId}/suppliers/{supplierId}
     * Soft-deletes a supplier (sets active=false). This preserves historical delivery records.
     * Only OWNER can deactivate a supplier.
     */
    @DeleteMapping("/{pumpId}/suppliers/{supplierId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivateSupplier(
            @PathVariable Long pumpId,
            @PathVariable Long supplierId,
            @AuthenticationPrincipal User currentUser) {
        if (currentUser.getRole() != UserRole.OWNER) {
            throw new com.ppms.common.exception.BusinessException("Only Owner can remove suppliers.");
        }

        FuelSupplier supplier = supplierRepository.findById(supplierId)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier not found"));

        supplier.setActive(false);
        supplierRepository.save(supplier);
    }

    private void requireOwnerOrAdmin(User user) {
        if (user.getRole() != UserRole.OWNER && user.getRole() != UserRole.ADMIN) {
            throw new com.ppms.common.exception.BusinessException(
                    "Only Owner or Admin can manage suppliers.");
        }
    }
}
