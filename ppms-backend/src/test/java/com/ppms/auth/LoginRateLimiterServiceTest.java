package com.ppms.auth;

import com.ppms.support.TestDates;
import com.ppms.common.exception.TooManyRequestsException;
import com.ppms.common.time.BusinessClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;


import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LoginRateLimiterServiceTest {

    @Mock private LoginAttemptRepository attemptRepository;
    @Mock private BusinessClock businessClock;

    private LoginRateLimiterService limiter;

    @BeforeEach
    void createLimiter() {
        limiter = new LoginRateLimiterService(attemptRepository, businessClock);
    }

    @Test
    void loginIsAllowedBelowBothLimits() {
        when(businessClock.now()).thenReturn(TestDates.now());
        when(attemptRepository.countRecentFailures(eq("9000000001"), any())).thenReturn(4L);
        when(attemptRepository.countRecentFailuresByIp(eq("10.0.0.1"), any())).thenReturn(19L);

        assertThatNoException().isThrownBy(() -> limiter.checkLoginAllowed("9000000001", "10.0.0.1"));
    }

    @Test
    void fifthFailureForAPhoneBlocksFurtherLogins() {
        when(businessClock.now()).thenReturn(TestDates.now());
        when(attemptRepository.countRecentFailures(eq("9000000001"), any())).thenReturn(5L);

        assertThatThrownBy(() -> limiter.checkLoginAllowed("9000000001", "10.0.0.1"))
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    void twentiethFailureFromAnIpBlocksLoginsForAnyPhone() {
        when(businessClock.now()).thenReturn(TestDates.now());
        when(attemptRepository.countRecentFailures(eq("9000000002"), any())).thenReturn(0L);
        when(attemptRepository.countRecentFailuresByIp(eq("10.0.0.9"), any())).thenReturn(20L);

        assertThatThrownBy(() -> limiter.checkLoginAllowed("9000000002", "10.0.0.9"))
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    void resetEmailsForOnePhoneStopSilentlyAfterThreeRequests() {
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.isResetEmailAllowed("9000000003", "10.0.0." + i)).isTrue();
        }

        assertThat(limiter.isResetEmailAllowed("9000000003", "10.0.0.99")).isFalse();
    }

    @Test
    void resetRequestsFromOneIpAreRefusedAfterTenAttempts() {
        for (int i = 0; i < 10; i++) {
            limiter.isResetEmailAllowed("90000001" + String.format("%02d", i), "10.1.1.1");
        }

        assertThatThrownBy(() -> limiter.isResetEmailAllowed("9000000200", "10.1.1.1"))
                .isInstanceOf(TooManyRequestsException.class);
    }
}
