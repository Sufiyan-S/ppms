package com.ppms.auth;

import java.time.Duration;

/** The raw refresh token for the cookie and how long the cookie should live. The raw value is never stored or logged. */
public record IssuedRefreshToken(String value, Duration lifetime) {}
