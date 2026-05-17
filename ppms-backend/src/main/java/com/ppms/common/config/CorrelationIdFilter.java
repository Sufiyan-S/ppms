package com.ppms.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Servlet filter that assigns a unique traceId to every incoming HTTP request.
 *
 * The traceId is:
 *  1. Read from the X-Trace-Id request header if provided by an upstream gateway or client.
 *     This allows trace IDs to flow end-to-end across service boundaries.
 *  2. Generated as a new UUID if no header is present.
 *
 * The traceId is stored in SLF4J's MDC (Mapped Diagnostic Context) under the key "traceId".
 * Include %X{traceId} in your logback pattern to see it in every log line.
 *
 * The traceId is also echoed back in the X-Trace-Id response header so callers can
 * correlate their request to the server-side logs.
 *
 * MDC is thread-local — it is cleared after every request to prevent contamination
 * across requests on a reused thread.
 *
 * @Order(1) ensures this filter runs before all others, including JwtAuthenticationFilter,
 * so every log line (including auth failures) carries a traceId.
 */
@Component
@Order(1)
public class CorrelationIdFilter extends OncePerRequestFilter {

    public static final String TRACE_ID_HEADER = "X-Trace-Id";
    public static final String MDC_TRACE_ID    = "traceId";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String traceId = request.getHeader(TRACE_ID_HEADER);
        if (traceId == null || traceId.isBlank() || !traceId.matches("[a-zA-Z0-9\\-]{8,64}")) {
            traceId = UUID.randomUUID().toString().replace("-", "");
        }

        MDC.put(MDC_TRACE_ID, traceId);
        response.setHeader(TRACE_ID_HEADER, traceId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            // Always clear MDC — thread pools reuse threads, so stale context would
            // bleed into unrelated requests if not removed explicitly.
            MDC.remove(MDC_TRACE_ID);
        }
    }
}
