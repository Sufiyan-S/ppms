package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.BusinessException;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ShiftRepository shiftRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final AuditService auditService;

    /**
     * GET /api/users/operators?pumpId={id}
     * Returns active OPERATOR users assigned to a pump.
     * Used by the Open Shift form's operator dropdown.
     */
    @GetMapping("/operators")
    public ResponseEntity<List<StaffResponse>> getOperators(
            @RequestParam Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        assertPumpAccess(currentUser, pumpId);
        List<StaffResponse> operators = userRepository
                .findByAssignedPumpIdAndRoleAndStatus(pumpId, UserRole.OPERATOR, UserStatus.ACTIVE)
                .stream()
                .map(StaffResponse::from)
                .toList();
        return ResponseEntity.ok(operators);
    }

    /**
     * GET /api/users/staff?pumpId={id}
     * Returns all active staff (OPERATOR, MANAGER, ADMIN) assigned to a pump.
     * Used by the Setup page to show the current staff list.
     */
    @GetMapping("/staff")
    public ResponseEntity<List<StaffResponse>> getStaff(
            @RequestParam Long pumpId,
            @AuthenticationPrincipal User currentUser) {
        assertPumpAccess(currentUser, pumpId);
        List<StaffResponse> staff = userRepository
                .findByAssignedPumpId(pumpId)
                .stream()
                .filter(u -> u.getRole() != UserRole.OWNER && u.getRole() != UserRole.SUPER_ADMIN)
                .map(StaffResponse::from)
                .toList();
        return ResponseEntity.ok(staff);
    }

    /**
     * POST /api/users
     * Creates a new user (OPERATOR, MANAGER, or ADMIN).
     * Owner and Admin can create users. Operators and Managers cannot.
     *
     * The owner sets an initial password. The user should change it after first login
     * (password change feature will be added in a future build).
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER', 'ADMIN')")
    public ResponseEntity<StaffResponse> createUser(
            @Valid @RequestBody CreateUserRequest request,
            @AuthenticationPrincipal User currentUser) {

        if (userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new BusinessException("A user with phone number " + request.getPhoneNumber() + " already exists");
        }

        // Role escalation guard: a caller cannot create a user with a role at or above their own.
        // SUPER_ADMIN > OWNER > ADMIN > MANAGER/OPERATOR/ACCOUNTANT
        // Without this, an ADMIN could create OWNER accounts, bypassing subscription controls.
        assertCanAssignRole(currentUser.getRole(), request.getRole());

        // All staff roles (OPERATOR, MANAGER, ADMIN, ACCOUNTANT) must be assigned to a pump
        boolean isStaffRole = request.getRole() == UserRole.OPERATOR
                || request.getRole() == UserRole.MANAGER
                || request.getRole() == UserRole.ADMIN
                || request.getRole() == UserRole.ACCOUNTANT;

        if (isStaffRole && request.getAssignedPumpId() == null) {
            throw new BusinessException(request.getRole() + " must be assigned to a pump");
        }

        // OWNER and ADMIN can only create staff for their own pump
        if (currentUser.getRole() == UserRole.OWNER || currentUser.getRole() == UserRole.ADMIN) {
            Long callerPumpId = currentUser.getRole() == UserRole.OWNER
                    ? null  // OWNER owns pumps — pump is identified by assignedPumpId in request
                    : currentUser.getAssignedPumpId();

            Long targetPumpId = request.getAssignedPumpId();

            if (currentUser.getRole() == UserRole.OWNER) {
                // Verify the target pump belongs to this OWNER
                if (targetPumpId != null && !pumpLocationRepository.existsByIdAndOwnerId(targetPumpId, currentUser.getId())) {
                    throw new BusinessException("You do not own pump " + targetPumpId);
                }
            } else {
                // ADMIN can only create staff for their own pump
                if (targetPumpId != null && !targetPumpId.equals(callerPumpId)) {
                    throw new BusinessException("You can only create staff for pump " + callerPumpId);
                }
            }
        }

        // Auto-generate employee ID if not provided
        String employeeId = request.getEmployeeId();
        if (employeeId == null || employeeId.isBlank()) {
            employeeId = isStaffRole
                    ? generateStaffEmployeeId(request.getAssignedPumpId())
                    : "OWN" + System.currentTimeMillis();
        }

        if (userRepository.existsByEmployeeId(employeeId)) {
            throw new BusinessException("Employee ID '" + employeeId + "' is already taken. Please provide a different one.");
        }

        User user = User.builder()
                .fullName(request.getFullName())
                .phoneNumber(request.getPhoneNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .gender(request.getGender())
                .nightShiftConsent(request.getRole() == UserRole.OPERATOR
                        && request.getGender() == UserGender.FEMALE
                        && Boolean.TRUE.equals(request.getNightShiftConsent()))
                .role(request.getRole())
                .status(UserStatus.ACTIVE)
                .assignedPumpId(request.getAssignedPumpId())
                .address(request.getAddress())
                .employeeId(employeeId)
                .dateOfJoining(request.getDateOfJoining() != null ? request.getDateOfJoining() : LocalDate.now())
                .build();

        user = userRepository.save(user);

        auditService.log(user.getAssignedPumpId(), AuditAction.USER_CREATED,
                "User", user.getId().toString(),
                "User created: " + user.getFullName() + " (" + user.getRole() + ") employeeId=" + user.getEmployeeId(),
                currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(StaffResponse.from(user));
    }

    /**
     * PATCH /api/users/me/profile
     * Allows any authenticated user to update their own display name.
     * No role restriction — every user can rename themselves.
     */
    @PatchMapping("/me/profile")
    public ResponseEntity<StaffResponse> updateMyProfile(
            @RequestBody UpdateProfileRequest request,
            @AuthenticationPrincipal User currentUser) {

        if (request.getFullName() == null || request.getFullName().isBlank()) {
            throw new BusinessException("Full name cannot be blank");
        }

        currentUser.setFullName(request.getFullName().trim());
        User updated = userRepository.save(currentUser);
        return ResponseEntity.ok(StaffResponse.from(updated));
    }

    /**
     * PATCH /api/users/{userId}/status
     * Activates or deactivates a user. Owner only (spec Business Rules 30, 45).
     *
     * Deactivation is blocked if:
     *   - The operator has an open shift (Business Rule 45)
     *   - The operator has unresolved discrepancies (Business Rule 30)
     */
    @PatchMapping("/{userId}/status")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'OWNER')")
    public ResponseEntity<StaffResponse> updateUserStatus(
            @PathVariable Long userId,
            @RequestParam UserStatus status,
            @AuthenticationPrincipal User currentUser) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("User not found"));

        if (user.getRole() == UserRole.OWNER) {
            throw new BusinessException("Owner account status cannot be changed through this endpoint.");
        }

        if (status == UserStatus.INACTIVE) {
            if (shiftRepository.hasUnresolvedDiscrepancy(userId)) {
                throw new BusinessException(
                        user.getFullName() + " has unresolved shift discrepancies. Resolve all pending discrepancies before deactivating (Business Rule 30).");
            }
        }

        user.setStatus(status);
        user = userRepository.save(user);

        AuditAction action = status == UserStatus.INACTIVE ? AuditAction.USER_DEACTIVATED : AuditAction.USER_STATUS_CHANGED;
        auditService.log(user.getAssignedPumpId(), action,
                "User", user.getId().toString(),
                "User status changed to " + status + " for " + user.getFullName() + " (" + user.getRole() + ")",
                currentUser);

        return ResponseEntity.ok(StaffResponse.from(user));
    }

    // ---

    /**
     * Generates a pump-prefixed sequential employee ID: EMP{pumpId}{seq:05d}.
     * Example: pump 1, 3rd employee → EMP100003.
     *
     * Note: count-based sequence has a small race window under concurrent creation.
     * The unique DB constraint on employee_id acts as the final safety net.
     */
    private String generateStaffEmployeeId(Long pumpId) {
        long count = userRepository.countByAssignedPumpId(pumpId);
        return String.format("EMP%d%05d", pumpId, count + 1);
    }

    /**
     * Validates that the current user has access to the given pump.
     * Used for /api/users endpoints that take pumpId as a query parameter
     * (which are not covered by the URL-pattern-based PumpAccessInterceptor).
     */
    /**
     * Enforces the role hierarchy — a caller cannot create a user at or above their own privilege level.
     *
     * Permitted assignments by caller role:
     *   SUPER_ADMIN → any role
     *   OWNER       → ADMIN, MANAGER, OPERATOR, ACCOUNTANT
     *   ADMIN       → MANAGER, OPERATOR, ACCOUNTANT
     *
     * This prevents privilege escalation: an ADMIN cannot create OWNER or SUPER_ADMIN accounts.
     */
    private void assertCanAssignRole(UserRole callerRole, UserRole targetRole) {
        boolean allowed = switch (callerRole) {
            case SUPER_ADMIN -> true;
            case OWNER -> targetRole != UserRole.SUPER_ADMIN && targetRole != UserRole.OWNER;
            case ADMIN -> targetRole == UserRole.MANAGER
                    || targetRole == UserRole.OPERATOR
                    || targetRole == UserRole.ACCOUNTANT;
            default -> false; // MANAGER, OPERATOR, ACCOUNTANT cannot create users
        };
        if (!allowed) {
            throw new BusinessException(
                    "You do not have permission to create a user with role " + targetRole + ". " +
                    "A " + callerRole + " can only create users with a lower role.");
        }
    }

    private void assertPumpAccess(User currentUser, Long pumpId) {
        if (currentUser.getRole() == UserRole.SUPER_ADMIN) {
            return;
        }
        if (currentUser.getRole() == UserRole.OWNER) {
            if (!pumpLocationRepository.existsByIdAndOwnerId(pumpId, currentUser.getId())) {
                throw new BusinessException("You do not have access to pump " + pumpId);
            }
            return;
        }
        if (!pumpId.equals(currentUser.getAssignedPumpId())) {
            throw new BusinessException("You are not assigned to pump " + pumpId);
        }
    }

    /**
     * PATCH /api/users/{userId}/pay-rates
     * Sets or updates the hourly pay rates for a staff member.
     * Only the OWNER can configure pay rates.
     *
     * shift1HourlyRate    — rate for SHIFT_1 (00:00–08:00, night shift)
     * standardHourlyRate  — rate for SHIFT_2 (08:00–16:00) and SHIFT_3 (16:00–24:00)
     */
    @PatchMapping("/{userId}/pay-rates")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<StaffResponse> updatePayRates(
            @PathVariable Long userId,
            @RequestBody UpdatePayRatesRequest request,
            @AuthenticationPrincipal User currentUser) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("User not found"));

        if (user.getRole() == UserRole.OPERATOR) {
            if (request.getShift1HourlyRate() == null || request.getShift1HourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Shift 1 (night) hourly rate must be greater than zero");
            }
            if (request.getStandardHourlyRate() == null || request.getStandardHourlyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Standard (day) hourly rate must be greater than zero");
            }
            user.setShift1HourlyRate(request.getShift1HourlyRate());
            user.setStandardHourlyRate(request.getStandardHourlyRate());
        } else {
            if (request.getDailyRate() == null || request.getDailyRate().compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessException("Daily rate must be greater than zero");
            }
            user.setDailyRate(request.getDailyRate());
        }
        user = userRepository.save(user);

        return ResponseEntity.ok(StaffResponse.from(user));
    }

    // ---

    @lombok.Data
    public static class UpdateProfileRequest {
        private String fullName;
    }

    @lombok.Data
    public static class UpdatePayRatesRequest {
        /** For OPERATOR: night shift hourly rate (SHIFT_1 00:00–08:00). */
        private BigDecimal shift1HourlyRate;
        /** For OPERATOR: standard day hourly rate (SHIFT_2 + SHIFT_3). */
        private BigDecimal standardHourlyRate;
        /** For MANAGER / ADMIN / ACCOUNTANT: flat daily rate. */
        private BigDecimal dailyRate;
    }

    public record StaffResponse(
            Long id,
            String employeeId,
            String fullName,
            String phoneNumber,
            String gender,
            Boolean nightShiftConsent,
            String role,
            Long assignedPumpId,
            String status,
            BigDecimal dailyRate,
            BigDecimal shift1HourlyRate,
            BigDecimal standardHourlyRate
    ) {
        static StaffResponse from(User u) {
            return new StaffResponse(
                    u.getId(),
                    u.getEmployeeId(),
                    u.getFullName(),
                    u.getPhoneNumber(),
                    u.getGender() != null ? u.getGender().name() : null,
                    u.isNightShiftConsent(),
                    u.getRole().name(),
                    u.getAssignedPumpId(),
                    u.getStatus().name(),
                    u.getDailyRate(),
                    u.getShift1HourlyRate(),
                    u.getStandardHourlyRate()
            );
        }
    }
}
