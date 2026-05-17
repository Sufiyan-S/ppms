package com.ppms.inventory;

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

import java.math.RoundingMode;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
public class TankerController {

    private final TankerRepository tankerRepository;

    @GetMapping("/{pumpId}/tankers")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<TankerResponse>> getTankers(@PathVariable Long pumpId) {
        return ResponseEntity.ok(
                tankerRepository.findByPumpIdAndActiveTrueOrderByNameAsc(pumpId)
                        .stream().map(this::toResponse).toList()
        );
    }

    @PostMapping("/{pumpId}/tankers")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<TankerResponse> createTanker(
            @PathVariable Long pumpId,
            @Valid @RequestBody CreateTankerRequest request,
            @AuthenticationPrincipal User currentUser) {

        if (request.isDefaultTanker()) {
            tankerRepository.clearAllDefaultsForPump(pumpId);
        }

        Tanker tanker = Tanker.builder()
                .pumpId(pumpId)
                .name(request.getName().trim())
                .capacityLitres(request.getCapacityLitres().setScale(2, RoundingMode.HALF_UP))
                .tankerType(request.getTankerType())
                .defaultTanker(request.isDefaultTanker())
                .active(true)
                .build();

        tanker = tankerRepository.save(tanker);
        log.info("Tanker created: pump={}, tanker={}, name='{}', capacity={}L, by={}",
                pumpId, tanker.getId(), tanker.getName(), tanker.getCapacityLitres(), currentUser.getId());
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(tanker));
    }

    @PatchMapping("/{pumpId}/tankers/{tankerId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<TankerResponse> updateTanker(
            @PathVariable Long pumpId,
            @PathVariable Long tankerId,
            @Valid @RequestBody CreateTankerRequest request) {

        Tanker tanker = tankerRepository.findById(tankerId)
                .orElseThrow(() -> new ResourceNotFoundException("Tanker not found"));

        if (!tanker.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tanker does not belong to this pump");
        }

        if (request.isDefaultTanker()) {
            tankerRepository.clearAllDefaultsForPump(pumpId);
        }

        tanker.setName(request.getName().trim());
        tanker.setCapacityLitres(request.getCapacityLitres().setScale(2, RoundingMode.HALF_UP));
        tanker.setTankerType(request.getTankerType());
        tanker.setDefaultTanker(request.isDefaultTanker());
        tanker = tankerRepository.save(tanker);

        return ResponseEntity.ok(toResponse(tanker));
    }

    @DeleteMapping("/{pumpId}/tankers/{tankerId}")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivateTanker(
            @PathVariable Long pumpId,
            @PathVariable Long tankerId) {

        Tanker tanker = tankerRepository.findById(tankerId)
                .orElseThrow(() -> new ResourceNotFoundException("Tanker not found"));

        if (!tanker.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tanker does not belong to this pump");
        }

        tanker.setActive(false);
        tanker.setDefaultTanker(false);
        tankerRepository.save(tanker);
        log.info("Tanker deactivated: pump={}, tanker={}", pumpId, tankerId);
    }

    @PatchMapping("/{pumpId}/tankers/{tankerId}/set-default")
    @PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'MANAGER')")
    @Transactional
    public ResponseEntity<TankerResponse> setDefault(
            @PathVariable Long pumpId,
            @PathVariable Long tankerId) {

        Tanker tanker = tankerRepository.findById(tankerId)
                .orElseThrow(() -> new ResourceNotFoundException("Tanker not found"));

        if (!tanker.getPumpId().equals(pumpId)) {
            throw new BusinessException("Tanker does not belong to this pump");
        }

        tankerRepository.clearAllDefaultsForPump(pumpId);
        tanker.setDefaultTanker(true);
        tanker = tankerRepository.save(tanker);

        return ResponseEntity.ok(toResponse(tanker));
    }

    private TankerResponse toResponse(Tanker t) {
        return TankerResponse.builder()
                .id(t.getId())
                .pumpId(t.getPumpId())
                .name(t.getName())
                .capacityLitres(t.getCapacityLitres())
                .tankerType(t.getTankerType().name())
                .defaultTanker(t.isDefaultTanker())
                .active(t.isActive())
                .createdAt(t.getCreatedAt())
                .build();
    }
}
