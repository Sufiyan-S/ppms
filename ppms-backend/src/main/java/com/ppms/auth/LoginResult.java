package com.ppms.auth;

/**
 * Internal carrier returned by AuthService.login().
 * Separates the raw JWT (needed to set the cookie) from the user-facing response body.
 * The token is never passed to the HTTP response body — only to the cookie setter.
 */
public record LoginResult(String token, LoginResponse loginResponse) {}
