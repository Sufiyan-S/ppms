package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.auth.LoginRateLimiterService;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    private static final long PUMP_ID = 4L;
    private static final String TEMPORARY_PASSWORD = "Temp@4321";

    @Mock private UserRepository userRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private ShiftRepository shiftRepository;
    @Mock private PumpLocationRepository pumpLocationRepository;
    @Mock private AuditService auditService;
    @Mock private BusinessClock businessClock;
    @Mock private LoginRateLimiterService loginRateLimiterService;

    @InjectMocks private UserService userService;

    @Test
    void resetStoresTheNewHashEndsSessionsFlagsTheUserAndClearsTheLockout() {
        User admin = user(1L, UserRole.ADMIN, PUMP_ID);
        User operator = user(2L, UserRole.OPERATOR, PUMP_ID);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(operator));
        when(passwordEncoder.encode(TEMPORARY_PASSWORD)).thenReturn("new-hash");

        userService.resetPassword(2L, resetRequest(), admin);

        assertThat(operator.getPasswordHash()).isEqualTo("new-hash");
        assertThat(operator.getTokenVersion()).isEqualTo(1);
        assertThat(operator.isMustChangePassword()).isTrue();
        verify(loginRateLimiterService).clearFailedLogins(operator.getPhoneNumber());
        ArgumentCaptor<String> description = ArgumentCaptor.forClass(String.class);
        verify(auditService).log(eq(PUMP_ID), eq(AuditAction.PASSWORD_RESET), eq("User"), eq("2"),
                description.capture(), eq(admin));
        assertThat(description.getValue()).doesNotContain(TEMPORARY_PASSWORD);
    }

    @Test
    void adminCannotResetAnotherAdmin() {
        User admin = user(1L, UserRole.ADMIN, PUMP_ID);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(user(2L, UserRole.ADMIN, PUMP_ID)));

        assertThatThrownBy(() -> userService.resetPassword(2L, resetRequest(), admin))
                .isInstanceOf(AccessDeniedException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void ownerCannotResetStaffOfAPumpTheyDoNotOwn() {
        User owner = user(1L, UserRole.OWNER, null);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(user(2L, UserRole.OPERATOR, PUMP_ID)));
        when(pumpLocationRepository.existsByIdAndOwnerId(PUMP_ID, 1L)).thenReturn(false);

        assertThatThrownBy(() -> userService.resetPassword(2L, resetRequest(), owner))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void superAdminResetsOwnersOnly() {
        User superAdmin = user(1L, UserRole.SUPER_ADMIN, null);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(user(2L, UserRole.MANAGER, PUMP_ID)));

        assertThatThrownBy(() -> userService.resetPassword(2L, resetRequest(), superAdmin))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void deactivationIsRefusedWhileTheUserHasAnOpenShift() {
        User owner = user(1L, UserRole.OWNER, null);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(user(2L, UserRole.OPERATOR, PUMP_ID)));
        when(pumpLocationRepository.existsByIdAndOwnerId(PUMP_ID, 1L)).thenReturn(true);
        when(shiftRepository.hasOpenShift(2L)).thenReturn(true);

        assertThatThrownBy(() -> userService.updateUserStatus(2L, UserStatus.INACTIVE, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("open shift");
        verify(userRepository, never()).save(any());
    }

    @Test
    void deactivationIsRefusedWhileADiscrepancyWaitsForApproval() {
        User owner = user(1L, UserRole.OWNER, null);
        when(userRepository.findByIdForUpdate(2L)).thenReturn(Optional.of(user(2L, UserRole.OPERATOR, PUMP_ID)));
        when(pumpLocationRepository.existsByIdAndOwnerId(PUMP_ID, 1L)).thenReturn(true);
        when(shiftRepository.hasDiscrepancyPendingApproval(2L)).thenReturn(true);

        assertThatThrownBy(() -> userService.updateUserStatus(2L, UserStatus.INACTIVE, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("waiting for approval");
        verify(auditService, never()).log(any(), any(), anyString(), anyString(), anyString(), any(User.class));
    }

    private static ResetPasswordRequest resetRequest() {
        ResetPasswordRequest request = new ResetPasswordRequest();
        request.setTemporaryPassword(TEMPORARY_PASSWORD);
        return request;
    }

    private static User user(long id, UserRole role, Long pumpId) {
        return User.builder()
                .id(id)
                .fullName(role + " " + id)
                .phoneNumber("90000000" + String.format("%02d", id))
                .passwordHash("old-hash")
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(pumpId)
                .build();
    }
}
