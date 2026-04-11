package com.ppms.auth;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.user.User;
import io.micrometer.core.instrument.Counter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthLoginEventService {

    private final LoginRateLimiterService rateLimiterService;
    private final AuditService auditService;
    private final Counter loginSuccessCounter;
    private final Counter loginFailureCounter;

    public void onLoginSuccess(User user, String ipAddress) {
        rateLimiterService.recordAttempt(user.getPhoneNumber(), ipAddress, true);
        log.info("Login successful: userId={} phone={} ip={}", user.getId(), user.getPhoneNumber(), ipAddress);
        loginSuccessCounter.increment();

        auditService.log(user.getAssignedPumpId(), AuditAction.LOGIN,
                "User", user.getId().toString(),
                "Successful login from ip=" + ipAddress,
                user.getId(), user.getFullName());
    }

    public void onLoginFailure(String phoneNumber, String ipAddress) {
        rateLimiterService.recordAttempt(phoneNumber, ipAddress, false);
        log.warn("Login failed: phone={} ip={}", phoneNumber, ipAddress);
        loginFailureCounter.increment();

        auditService.log(null, AuditAction.LOGIN_FAILED,
                "User", null,
                "Failed login attempt for phone=" + phoneNumber + " from ip=" + ipAddress,
                null, phoneNumber);
    }
}
