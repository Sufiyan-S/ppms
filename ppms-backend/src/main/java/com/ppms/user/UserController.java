package com.ppms.user;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** Active operators of a pump, for the Open Shift operator dropdown. */
    @GetMapping("/operators")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER')")
    public ResponseEntity<List<StaffResponse>> getOperators(
            @RequestParam Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.getOperators(pumpId, currentUser));
    }

    @GetMapping("/staff")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT')")
    public ResponseEntity<List<StaffResponse>> getStaff(
            @RequestParam Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.getStaff(pumpId, currentUser));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER', 'ADMIN')")
    public ResponseEntity<StaffResponse> createUser(
            @Valid @RequestBody CreateUserRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.createUser(request, currentUser));
    }

    @PatchMapping("/{userId}/details")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER', 'ADMIN')")
    public ResponseEntity<StaffResponse> updateStaffDetails(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateStaffDetailsRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.updateStaffDetails(userId, request, currentUser));
    }

    /** Any signed-in user may change their own display name. */
    @PatchMapping("/me/profile")
    public ResponseEntity<StaffResponse> updateMyProfile(
            @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.updateMyProfile(request, currentUser));
    }

    @PatchMapping("/{userId}/status")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER')")
    public ResponseEntity<StaffResponse> updateUserStatus(
            @PathVariable Long userId,
            @RequestParam UserStatus status,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.updateUserStatus(userId, status, currentUser));
    }

    @PatchMapping("/{userId}/pay-rates")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<StaffResponse> updatePayRates(
            @PathVariable Long userId,
            @RequestBody UpdatePayRatesRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.updatePayRates(userId, request, currentUser));
    }
}
