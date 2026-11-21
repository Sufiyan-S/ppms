package com.ppms.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reads, writes and clears the httpOnly JWT and refresh token cookies.
 * Set-Cookie is written by hand because the Jakarta Cookie API cannot set SameSite=Strict.
 */
@Component
public class JwtCookieSupport {

    public static final String COOKIE_NAME = "ppms_jwt";
    public static final String REFRESH_COOKIE_NAME = "ppms_refresh";

    private static final String COOKIE_PATH = "/api";
    // Logout must read the refresh cookie too, so it is scoped to all auth endpoints, not only /refresh.
    static final String REFRESH_COOKIE_PATH = "/api/auth";

    private final boolean cookieSecure;
    private final long jwtExpirationMs;

    public JwtCookieSupport(@Value("${ppms.cookie.secure}") boolean cookieSecure,
                            @Value("${ppms.jwt.expiration-ms}") long jwtExpirationMs) {
        this.cookieSecure = cookieSecure;
        this.jwtExpirationMs = jwtExpirationMs;
    }

    public String readToken(HttpServletRequest request) {
        return readCookie(request, COOKIE_NAME);
    }

    public String readRefreshToken(HttpServletRequest request) {
        return readCookie(request, REFRESH_COOKIE_NAME);
    }

    // setHeader first replaces any clearing cookie the JWT filter already wrote for an expired token.
    public void writeSessionCookies(HttpServletResponse response, String token, IssuedRefreshToken refreshToken) {
        response.setHeader("Set-Cookie", buildCookie(COOKIE_NAME, token, COOKIE_PATH, jwtExpirationMs / 1000));
        response.addHeader("Set-Cookie", buildCookie(REFRESH_COOKIE_NAME, refreshToken.value(),
                REFRESH_COOKIE_PATH, refreshToken.lifetime().toSeconds()));
    }

    public void clearToken(HttpServletResponse response) {
        response.setHeader("Set-Cookie", buildCookie(COOKIE_NAME, "", COOKIE_PATH, 0));
    }

    public void clearSessionCookies(HttpServletResponse response) {
        clearToken(response);
        response.addHeader("Set-Cookie", buildCookie(REFRESH_COOKIE_NAME, "", REFRESH_COOKIE_PATH, 0));
    }

    private String readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private String buildCookie(String name, String value, String path, long maxAgeSeconds) {
        return String.format("%s=%s; HttpOnly; %sPath=%s; Max-Age=%d; SameSite=Strict",
                name, value, cookieSecure ? "Secure; " : "", path, maxAgeSeconds);
    }
}
