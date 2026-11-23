package com.ppms.auth;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuthLoginEventServiceTest {

    private final AuditService auditService = mock(AuditService.class);
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final AuthLoginEventService loginEventService = new AuthLoginEventService(
            mock(LoginRateLimiterService.class), auditService,
            meterRegistry.counter("login.success"), meterRegistry.counter("login.failure"));

    @Test
    void failedLoginIsAuditedWithTheMaskedPhoneNumberOnly() {
        loginEventService.onLoginFailure("9876543210", "203.0.113.7");

        ArgumentCaptor<String> description = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> actorName = ArgumentCaptor.forClass(String.class);
        verify(auditService).log(isNull(), eq(AuditAction.LOGIN_FAILED), eq("User"), isNull(),
                description.capture(), isNull(), actorName.capture());

        assertThat(actorName.getValue()).isEqualTo("******3210");
        assertThat(description.getValue()).contains("******3210").doesNotContain("9876543210");
        assertThat(meterRegistry.counter("login.failure").count()).isEqualTo(1.0);
    }

    @Test
    void failedLoginStillCountsTheAttemptAgainstTheRealPhoneNumber() {
        LoginRateLimiterService rateLimiter = mock(LoginRateLimiterService.class);
        new AuthLoginEventService(rateLimiter, auditService, meterRegistry.counter("a"), meterRegistry.counter("b"))
                .onLoginFailure("9876543210", "203.0.113.7");

        verify(rateLimiter).recordAttempt("9876543210", "203.0.113.7", false);
    }
}
