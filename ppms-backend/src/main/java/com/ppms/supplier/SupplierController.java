package com.ppms.supplier;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping("/{pumpId}/suppliers")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public List<FuelSupplier> getSuppliers(@PathVariable Long pumpId) {
        return supplierService.getActiveSuppliers(pumpId);
    }

    @PostMapping("/{pumpId}/suppliers")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public FuelSupplier createSupplier(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpsertSupplierRequest req) {
        return supplierService.createSupplier(pumpId, req);
    }

    @PutMapping("/{pumpId}/suppliers/{supplierId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
    public FuelSupplier updateSupplier(
            @PathVariable Long pumpId,
            @PathVariable Long supplierId,
            @Valid @RequestBody UpsertSupplierRequest req) {
        return supplierService.updateSupplier(pumpId, supplierId, req);
    }

    @DeleteMapping("/{pumpId}/suppliers/{supplierId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void deactivateSupplier(
            @PathVariable Long pumpId,
            @PathVariable Long supplierId) {
        supplierService.deactivateSupplier(pumpId, supplierId);
    }
}
