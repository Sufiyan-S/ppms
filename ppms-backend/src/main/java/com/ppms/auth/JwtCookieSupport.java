package com.ppms.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reads, writes and clears the httpOnly JWT cookie.
 * Set-Cookie is written by hand because the Jakarta Cookie API cannot set SameSite=Strict.
 */
@Component
public class JwtCookieSupport {

    public static final String COOKIE_NAME = "ppms_jwt";

    private final boolean cookieSecure;
    private final long jwtExpirationMs;

    public JwtCookieSupport(@Value("${ppms.cookie.secure}") boolean cookieSecure,
                            @Value("${ppms.jwt.expiration-ms}") long jwtExpirationMs) {
        this.cookieSecure = cookieSecure;
        this.jwtExpirationMs = jwtExpirationMs;
    }

    public String readToken(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    public void writeToken(HttpServletResponse response, String token) {
        response.setHeader("Set-Cookie", buildCookie(token, jwtExpirationMs / 1000));
    }

    public void clearToken(HttpServletResponse response) {
        response.setHeader("Set-Cookie", buildCookie("", 0));
    }

    private String buildCookie(String value, long maxAgeSeconds) {
        return String.format("%s=%s; HttpOnly; %sPath=/api; Max-Age=%d; SameSite=Strict",
                COOKIE_NAME, value, cookieSecure ? "Secure; " : "", maxAgeSeconds);
    }
}
