package com.ppms.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Resolves the caller's IP. X-Forwarded-For is read right to left, skipping configured proxies,
 * because entries left of the last trusted hop are written by the client and can be forged.
 */
@Component
public class ClientIpResolver {

    private static final int MAX_IP_LENGTH = 45;
    private static final Pattern IPV4 = Pattern.compile(
            "^((25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$");
    private static final Pattern IPV6 = Pattern.compile("^[0-9a-fA-F:.]{2,45}$");

    private final List<IpAddressMatcher> trustedProxies;

    public ClientIpResolver(@Value("${ppms.security.trusted-proxy-ips}") String trustedProxyIps) {
        this.trustedProxies = Arrays.stream(trustedProxyIps.split(","))
                .map(String::trim)
                .filter(entry -> !entry.isEmpty())
                .map(IpAddressMatcher::new)
                .toList();
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (!isTrustedProxy(remoteAddr)) {
            return remoteAddr;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank()) {
            return remoteAddr;
        }
        String[] hops = forwarded.split(",");
        for (int i = hops.length - 1; i >= 0; i--) {
            String hop = hops[i].trim();
            if (!isValidIp(hop)) {
                return remoteAddr;
            }
            if (!isTrustedProxy(hop)) {
                return hop;
            }
        }
        return remoteAddr;
    }

    private boolean isTrustedProxy(String address) {
        return isValidIp(address) && trustedProxies.stream().anyMatch(matcher -> matcher.matches(address));
    }

    static boolean isValidIp(String value) {
        if (value == null || value.isEmpty() || value.length() > MAX_IP_LENGTH) {
            return false;
        }
        if (IPV4.matcher(value).matches()) {
            return true;
        }
        return value.contains(":") && IPV6.matcher(value).matches();
    }
}
