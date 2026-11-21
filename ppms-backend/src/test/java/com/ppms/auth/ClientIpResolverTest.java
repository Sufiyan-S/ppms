package com.ppms.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ClientIpResolverTest {

    private final ClientIpResolver resolver = new ClientIpResolver("127.0.0.1, 172.16.0.0/12");

    @Test
    void usesForwardedHeaderWhenPeerIsInTrustedRange() {
        assertThat(resolver.resolve(requestFrom("172.18.0.5", "203.0.113.9, 172.18.0.5")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void ignoresForwardedHeaderFromUntrustedPeer() {
        assertThat(resolver.resolve(requestFrom("198.51.100.4", "203.0.113.9")))
                .isEqualTo("198.51.100.4");
    }

    @Test
    void ignoresClientWrittenEntriesLeftOfTheLastTrustedHop() {
        assertThat(resolver.resolve(requestFrom("172.18.0.5", "1.1.1.1, 203.0.113.9")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void skipsEveryTrustedProxyFromTheRight() {
        assertThat(resolver.resolve(requestFrom("127.0.0.1", "1.1.1.1, 203.0.113.9, 172.20.0.2, 172.18.0.5")))
                .isEqualTo("203.0.113.9");
    }

    @Test
    void fallsBackToPeerWhenRightmostEntryIsNotAnIp() {
        assertThat(resolver.resolve(requestFrom("172.18.0.5", "a".repeat(60))))
                .isEqualTo("172.18.0.5");
    }

    @Test
    void acceptsIpv6Client() {
        assertThat(resolver.resolve(requestFrom("172.18.0.5", "2001:db8::1")))
                .isEqualTo("2001:db8::1");
    }

    private MockHttpServletRequest requestFrom(String remoteAddr, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        request.addHeader("X-Forwarded-For", forwardedFor);
        return request;
    }
}
