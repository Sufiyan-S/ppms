package com.ppms.shift;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ShiftHistoryFuelFilterIntegrationTest extends ApiIntegrationTest {

    private PumpSetup setup;
    private long shiftId;

    @BeforeEach
    void openAPetrolShift() throws Exception {
        setup = createPumpWithStock("1000");
        shiftId = json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    @Test
    void historyFilteredByFuelKeepsOnlyShiftsThatSoldIt() throws Exception {
        assertThat(shiftIds(history("PETROL", setup.manager()))).containsExactly(shiftId);
        assertThat(shiftIds(history("DIESEL", setup.manager()))).isEmpty();
    }

    @Test
    void operatorFilteringByFuelStillSeesOnlyTheirOwnShifts() throws Exception {
        assertThat(shiftIds(history("PETROL", setup.operator()))).containsExactly(shiftId);
        User otherOperator = saveUser(UserRole.OPERATOR, setup.pumpId());
        assertThat(shiftIds(history("PETROL", otherOperator))).isEmpty();
    }

    @Test
    void fuelFilterCannotBeCombinedWithDiscrepanciesOnly() throws Exception {
        perform(get("/api/pumps/{pumpId}/shifts/history", setup.pumpId())
                .param("fuelType", "PETROL").param("discrepanciesOnly", "true"), setup.manager())
                .andExpect(status().isBadRequest());
    }

    private ResultActions history(String fuelType, User user) throws Exception {
        String today = TestDates.today().toString();
        return perform(get("/api/pumps/{pumpId}/shifts/history", setup.pumpId())
                .param("fuelType", fuelType).param("from", today).param("to", today), user);
    }

    private List<Long> shiftIds(ResultActions result) throws Exception {
        JsonNode page = json(result.andExpect(status().isOk()));
        List<Long> ids = new ArrayList<>();
        page.get("content").forEach(shift -> ids.add(shift.get("id").asLong()));
        return ids;
    }
}
