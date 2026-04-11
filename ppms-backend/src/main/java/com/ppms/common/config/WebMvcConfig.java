package com.ppms.common.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers Spring MVC interceptors.
 *
 * PumpAccessInterceptor is applied to all /api/pumps/** and /api/inventory/**
 * paths so every pump-scoped endpoint automatically enforces ownership checks.
 */
@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final PumpAccessInterceptor pumpAccessInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(pumpAccessInterceptor)
                .addPathPatterns("/api/pumps/**", "/api/inventory/**");
    }
}
