package com.ppms.common;

import com.ppms.support.TestDates;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.Map;
import java.util.stream.Stream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Each read endpoint: the permitted role gets 200, a role outside its rule gets 403, another pump's owner gets 403.
 * Each write endpoint listed: a role outside its rule and another pump's owner get 403.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class EndpointAccessMatrixIntegrationTest extends ApiIntegrationTest {

    private static final String TODAY = TestDates.today().toString();
    private static final String RANGE = "?from=" + TODAY + "&to=" + TODAY;

    private PumpSetup setup;
    private PumpSetup otherPump;

    @BeforeAll
    void createTwoPumps() throws Exception {
        setup = createPumpWithStock("1000");
        otherPump = createPumpWithStock("0");
    }

    static Stream<Arguments> readEndpoints() {
        return Stream.of(
                Arguments.of("/api/pumps/{pumpId}/credit-ledger", "ACCOUNTANT", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/credit-clients", "MANAGER", null),
                Arguments.of("/api/pumps/{pumpId}/credit-clients/credit-standing", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/credit-ledger/payments/pending", "MANAGER", "ACCOUNTANT"),
                Arguments.of("/api/pumps/{pumpId}/credit-invoices", "ACCOUNTANT", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/fuel-prices/current", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/fuel-prices/for-date?date=" + TODAY, "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/expenses", "ACCOUNTANT", null),
                Arguments.of("/api/pumps/{pumpId}/settlements/wallet", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/settlement-configs", "MANAGER", "ACCOUNTANT"),
                Arguments.of("/api/pumps/{pumpId}/notifications", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/notifications/history", "ACCOUNTANT", null),
                Arguments.of("/api/pumps/{pumpId}/settlements/pending-by-age", "MANAGER", "ACCOUNTANT"),
                Arguments.of("/api/pumps/{pumpId}/setup-checklist", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/audit-logs/actors", "OWNER", "ACCOUNTANT"),
                Arguments.of("/api/pumps/{pumpId}/handovers", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/cash-events", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/shift-plans/planned-operators?shiftDefinitionId={definitionId}&date=" + TODAY, "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/documents", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/audit-logs", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/supplier-payments", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/suppliers", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/tankers", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/calibrations", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/closures", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/balance-sheets", "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/reports/profit-loss" + RANGE, "MANAGER", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/reports/interest-accrual" + RANGE, "ACCOUNTANT", "OPERATOR"),
                Arguments.of("/api/pumps/{pumpId}/payroll", "OWNER", "ADMIN"),
                Arguments.of("/api/pumps/{pumpId}/bank-reconciliation/imports", "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/export/shifts" + RANGE, "ADMIN", "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/ancillary/products", "OPERATOR", "ACCOUNTANT"),
                Arguments.of("/api/pumps/{pumpId}/shifts/active", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/shifts/history", "MANAGER", null),
                Arguments.of("/api/pumps/{pumpId}/shifts/history", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/fuel-transactions", "ACCOUNTANT", null),
                Arguments.of("/api/pumps/{pumpId}/fuel-transactions", "OPERATOR", null),
                Arguments.of("/api/pumps/{pumpId}/dus", "MANAGER", null),
                Arguments.of("/api/pumps/{pumpId}/shift-definitions", "MANAGER", null),
                Arguments.of("/api/inventory/{pumpId}/tanks", "MANAGER", "OPERATOR"),
                Arguments.of("/api/inventory/{pumpId}/deliveries", "MANAGER", "OPERATOR"),
                Arguments.of("/api/inventory/{pumpId}/dip-checks", "MANAGER", "OPERATOR"));
    }

    @ParameterizedTest(name = "{0} allows {1}")
    @MethodSource("readEndpoints")
    void permittedRoleCanReadTheEndpoint(String path, String allowedRole, String deniedRole) throws Exception {
        perform(request(path, setup), staff(allowedRole)).andExpect(status().isOk());
    }

    @ParameterizedTest(name = "{0} refuses {2}")
    @MethodSource("readEndpoints")
    void roleOutsideTheRuleIsRefused(String path, String allowedRole, String deniedRole) throws Exception {
        if (deniedRole == null) {
            return;
        }
        perform(request(path, setup), staff(deniedRole)).andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0} refuses another pump's owner")
    @MethodSource("readEndpoints")
    void ownerOfAnotherPumpIsRefused(String path, String allowedRole, String deniedRole) throws Exception {
        perform(request(path, setup), otherPump.owner()).andExpect(status().isForbidden());
    }

    static Stream<Arguments> writeEndpoints() {
        return Stream.of(
                Arguments.of("/api/pumps/{pumpId}/credit-clients/1/extensions/1/revoke", Map.of("reason", "Matrix"), "MANAGER"),
                Arguments.of("/api/pumps/{pumpId}/bank-reconciliation/lines/1", Map.of("status", "IGNORED"), "MANAGER"));
    }

    @ParameterizedTest(name = "{0} refuses {2}")
    @MethodSource("writeEndpoints")
    void roleOutsideTheWriteRuleIsRefused(String path, Map<String, Object> body, String deniedRole) throws Exception {
        perform(write(path, setup), staff(deniedRole), body).andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0} refuses another pump's owner")
    @MethodSource("writeEndpoints")
    void ownerOfAnotherPumpCannotWrite(String path, Map<String, Object> body, String deniedRole) throws Exception {
        perform(write(path, setup), otherPump.owner(), body).andExpect(status().isForbidden());
    }

    private MockHttpServletRequestBuilder write(String path, PumpSetup pump) {
        String resolved = path.replace("{pumpId}", pump.pumpId().toString());
        return path.endsWith("/revoke") ? post(resolved) : patch(resolved);
    }

    private MockHttpServletRequestBuilder request(String path, PumpSetup pump) {
        return get(path.replace("{pumpId}", pump.pumpId().toString())
                .replace("{definitionId}", pump.allDayShift().getId().toString()));
    }

    private User staff(String role) {
        return switch (role) {
            case "OWNER" -> setup.owner();
            case "ADMIN" -> setup.admin();
            case "MANAGER" -> setup.manager();
            case "OPERATOR" -> setup.operator();
            case "ACCOUNTANT" -> setup.accountant();
            default -> throw new IllegalArgumentException("Unknown role " + role);
        };
    }
}
