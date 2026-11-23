package com.ppms.common.idempotency;

import jakarta.servlet.http.HttpServletRequest;

/**
 * A write as seen for idempotency: who sent it, the client's key (null when the header is absent),
 * the method and path, and the parsed body.
 */
public record IdempotentRequest(Long userId, String key, String endpoint, Object body) {

    public static IdempotentRequest of(Long userId, String key, HttpServletRequest httpRequest, Object body) {
        return new IdempotentRequest(userId, key, httpRequest.getMethod() + " " + httpRequest.getRequestURI(), body);
    }
}
