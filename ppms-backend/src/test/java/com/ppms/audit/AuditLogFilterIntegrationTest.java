package com.ppms.audit;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuditLogFilterIntegrationTest extends ApiIntegrationTest {

    private PumpSetup setup;

    @BeforeEach
    void createPumpAndSignInStaff() throws Exception {
        setup = createPumpWithStock("0");
        loginAs(setup.manager());
    }

    @Test
    void signInsCanBeHiddenWhileEverythingElseStays() throws Exception {
        assertThat(actions(auditLogs())).contains("LOGIN", "FUEL_PRICE_UPDATED");

        assertThat(actions(auditLogs().param("hideSignIns", "true")))
                .doesNotContain("LOGIN")
                .contains("FUEL_PRICE_UPDATED");
    }

    @Test
    void logCanBeNarrowedToOneActionAndOneUser() throws Exception {
        assertThat(actions(auditLogs().param("action", "FUEL_PRICE_UPDATED"))).containsOnly("FUEL_PRICE_UPDATED");

        JsonNode managerEvents = json(perform(auditLogs().param("actorId", setup.manager().getId().toString()),
                setup.owner()).andExpect(status().isOk()));
        assertThat(managerEvents.get("content")).isNotEmpty();
        managerEvents.get("content").forEach(event ->
                assertThat(event.get("actorId").asLong()).isEqualTo(setup.manager().getId()));
    }

    @Test
    void dateFiltersStillApply() throws Exception {
        String tomorrow = TestDates.today().plusDays(1).toString();
        assertThat(actions(auditLogs().param("from", tomorrow).param("to", tomorrow))).isEmpty();
        assertThat(actions(auditLogs().param("from", TestDates.today().toString()))).contains("FUEL_PRICE_UPDATED");
    }

    @Test
    void actorsListsEveryoneWithAnEventAtThePumpForOwnerOrAdminOnly() throws Exception {
        JsonNode actors = json(perform(get("/api/pumps/{pumpId}/audit-logs/actors", setup.pumpId()), setup.admin())
                .andExpect(status().isOk()));

        List<Long> actorIds = new ArrayList<>();
        actors.forEach(actor -> actorIds.add(actor.get("actorId").asLong()));
        assertThat(actorIds).contains(setup.owner().getId(), setup.manager().getId());
        perform(get("/api/pumps/{pumpId}/audit-logs/actors", setup.pumpId()), setup.manager())
                .andExpect(status().isForbidden());
    }

    private MockHttpServletRequestBuilder auditLogs() {
        return get("/api/pumps/{pumpId}/audit-logs", setup.pumpId()).param("size", "200");
    }

    private List<String> actions(MockHttpServletRequestBuilder request) throws Exception {
        JsonNode page = json(perform(request, setup.owner()).andExpect(status().isOk()));
        List<String> actions = new ArrayList<>();
        page.get("content").forEach(event -> actions.add(event.get("action").asText()));
        return actions;
    }
}
