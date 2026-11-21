package com.ppms.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GlobalExceptionHandlerTest {

    private static final String SECRET_DETAIL = "jdbc:postgresql://db-internal:5432/ppms password=hunter2";

    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new FailingController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @Test
    void lockWaitTimeoutAsksTheCallerToRetryWith409() throws Exception {
        mockMvc.perform(get("/test/lock-timeout"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Another update is in progress, please retry."));
    }

    @Test
    void unexpectedErrorReturns500WithoutInternalDetails() throws Exception {
        mockMvc.perform(get("/test/unexpected"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("An unexpected error occurred"))
                .andExpect(content().string(not(containsString("hunter2"))))
                .andExpect(content().string(not(containsString("jdbc"))));
    }

    @Test
    void malformedJsonBodyReturns400WithoutEchoingTheParserError() throws Exception {
        mockMvc.perform(post("/test/body").contentType(MediaType.APPLICATION_JSON).content("{\"amount\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request body. Check field types and enum values."));
    }

    @Test
    void parameterOfTheWrongTypeReturns400NamingTheParameter() throws Exception {
        mockMvc.perform(get("/test/typed").param("count", "many"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter 'count': many"));
    }

    @Test
    void missingRequiredParameterReturns400NamingTheParameter() throws Exception {
        mockMvc.perform(get("/test/typed"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Required parameter 'count' is missing"));
    }

    @Test
    void unsupportedHttpMethodReturns405() throws Exception {
        mockMvc.perform(post("/test/typed"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void recordFromAnotherPumpReturns404AndForbiddenActionReturns403() throws Exception {
        mockMvc.perform(get("/test/not-found")).andExpect(status().isNotFound());
        mockMvc.perform(get("/test/forbidden"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You do not have permission to perform this action"));
    }

    @RestController
    static class FailingController {

        @GetMapping("/test/lock-timeout")
        void lockTimeout() {
            throw new CannotAcquireLockException("canceling statement due to lock timeout");
        }

        @GetMapping("/test/unexpected")
        void unexpected() {
            throw new IllegalStateException(SECRET_DETAIL);
        }

        @PostMapping("/test/body")
        void body(@RequestBody Map<String, Object> body) {
        }

        @GetMapping("/test/typed")
        void typed(@RequestParam int count) {
        }

        @GetMapping("/test/not-found")
        void notFound() {
            throw new ResourceNotFoundException("Tank not found");
        }

        @GetMapping("/test/forbidden")
        void forbidden() {
            throw new org.springframework.security.access.AccessDeniedException(SECRET_DETAIL);
        }
    }
}
