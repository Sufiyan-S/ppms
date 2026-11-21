package com.ppms.auth;

/**
 * Internal carrier returned by login and refresh.
 * Separates the raw tokens (needed to set the cookies) from the user-facing response body.
 * The tokens are never passed to the HTTP response body — only to the cookie setters.
 */
public record LoginResult(String token, IssuedRefreshToken refreshToken, LoginResponse loginResponse) {}
