package com.ppms.user;

import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Staff with an open shift or an unsettled discrepancy stay active, and inactive operators take no shifts. */
class StaffDeactivationIntegrationTest extends ApiIntegrationTest {

    @Autowired private ShiftRepository shiftRepository;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
    }

    @Test
    void operatorWithAnOpenShiftCannotBeDeactivated() throws Exception {
        openShift(setup.operator());

        deactivate(setup.operator())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("has an open shift")));
        assertThat(userRepository.findById(setup.operator().getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void operatorWithADiscrepancyWaitingForApprovalCannotBeDeactivated() throws Exception {
        Shift shift = shiftRepository.findById(openShift(setup.operator())).orElseThrow();
        shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL);
        shiftRepository.save(shift);

        deactivate(setup.operator())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("waiting for approval")));
    }

    @Test
    void operatorWithAnUnresolvedDiscrepancyCannotBeDeactivated() throws Exception {
        Shift shift = shiftRepository.findById(openShift(setup.operator())).orElseThrow();
        shift.setStatus(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
        shiftRepository.save(shift);

        deactivate(setup.operator())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("unresolved shift discrepancies")));
    }

    @Test
    void inactiveOperatorCannotBeGivenAShift() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());
        deactivate(operator).andExpect(status().isOk());

        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(), openShiftRequest(operator))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("is inactive")));
    }

    @Test
    void inactiveOperatorCannotReceiveAHandover() throws Exception {
        long shiftId = openShift(setup.operator());
        User incoming = saveUser(UserRole.OPERATOR, setup.pumpId());
        deactivate(incoming).andExpect(status().isOk());

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                Map.of("outgoingShiftId", shiftId, "incomingOperatorId", incoming.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("is inactive")));
    }

    private ResultActions deactivate(User user) throws Exception {
        return perform(patch("/api/users/{userId}/status", user.getId()), setup.owner(), Map.of("status", "INACTIVE"));
    }

    private long openShift(User operator) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                openShiftRequest(operator))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }

    private Map<String, Object> openShiftRequest(User operator) {
        return Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                "operatorId", operator.getId());
    }
}
