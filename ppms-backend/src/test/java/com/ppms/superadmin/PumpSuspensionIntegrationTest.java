package com.ppms.superadmin;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLog;
import com.ppms.audit.AuditLogRepository;
import com.ppms.scheduler.OverdueShiftJob;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Super admin pump changes are audited for the owner to see, and a pump is never suspended mid-shift. */
class PumpSuspensionIntegrationTest extends ApiIntegrationTest {

    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private OverdueShiftJob overdueShiftJob;

    private PumpSetup setup;
    private User superAdmin;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
        superAdmin = saveUser(UserRole.SUPER_ADMIN, null);
    }

    @Test
    void pumpWithAnOpenShiftCannotBeSuspended() throws Exception {
        openShift();

        updatePump(setup.pump().getName(), false)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("1 open shift")));

        assertThat(pumpLocationRepository.findById(setup.pumpId()).orElseThrow().isEnabled()).isTrue();
    }

    @Test
    void suspendingEnablingAndRenamingAPumpAreAuditedOnThatPumpWithTheSuperAdminAsActor() throws Exception {
        updatePump(setup.pump().getName(), false).andExpect(status().isOk());
        updatePump(setup.pump().getName(), true).andExpect(status().isOk());
        updatePump("Renamed " + shortId(), true).andExpect(status().isOk());

        List<AuditLog> logs = auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId());
        assertThat(logs).extracting(AuditLog::getAction)
                .contains(AuditAction.PUMP_SUSPENDED, AuditAction.PUMP_ENABLED, AuditAction.PUMP_UPDATED);
        assertThat(logs)
                .filteredOn(log -> log.getAction() == AuditAction.PUMP_SUSPENDED || log.getAction() == AuditAction.PUMP_UPDATED)
                .allSatisfy(log -> assertThat(log.getActorId()).isEqualTo(superAdmin.getId()));
    }

    @Test
    void onboardingAnOwnerAndAddingAPumpAreAuditedOnTheNewPumps() throws Exception {
        JsonNode onboarded = json(perform(post("/api/super-admin/onboard-owner"), superAdmin,
                Map.of("fullName", "Audited Owner", "phoneNumber", "7" + String.format("%09d", System.nanoTime() % 1_000_000_000L),
                        "password", "Owner@1234", "pumpName", "First Pump", "pumpAddress", "Highway 9", "maxDuCount", 2))
                .andExpect(status().is2xxSuccessful()));
        long ownerId = onboarded.get("ownerId").asLong();
        long firstPumpId = onboarded.get("pumpId").asLong();

        JsonNode owner = json(perform(post("/api/super-admin/owners/{ownerId}/pumps", ownerId), superAdmin,
                Map.of("pumpName", "Second Pump", "pumpAddress", "Highway 10", "maxDuCount", 2))
                .andExpect(status().is2xxSuccessful()));
        long secondPumpId = 0;
        for (JsonNode pump : owner.get("pumps")) {
            if (pump.get("pumpId").asLong() != firstPumpId) {
                secondPumpId = pump.get("pumpId").asLong();
            }
        }

        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(firstPumpId))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.getAction()).isEqualTo(AuditAction.OWNER_ONBOARDED);
                    assertThat(log.getActorId()).isEqualTo(superAdmin.getId());
                });
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(secondPumpId))
                .extracting(AuditLog::getAction)
                .containsExactly(AuditAction.PUMP_CREATED);
    }

    @Test
    void overdueJobLeavesShiftsOfASuspendedPumpAlone() throws Exception {
        Shift shift = shiftRepository.findById(openShift()).orElseThrow();
        shift.setStatus(ShiftStatus.OPEN_OVERDUE);
        shiftRepository.save(shift);
        setup.pump().setEnabled(false);
        pumpLocationRepository.save(setup.pump());

        overdueShiftJob.processOverdueShifts();

        assertThat(shiftRepository.findById(shift.getId()).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN_OVERDUE);
        assertThat(shiftRepository.findAllOpenShiftIds()).doesNotContain(shift.getId());
    }

    @Test
    void staffOfASuspendedPumpGetNoPumpAndAreRefusedItsData() throws Exception {
        updatePump(setup.pump().getName(), false).andExpect(status().isOk());

        perform(get("/api/pumps"), setup.manager())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()), setup.manager())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Pump is suspended"))
                .andExpect(jsonPath("$.code").value("PUMP_SUSPENDED"));
    }

    private ResultActions updatePump(String name, boolean enabled) throws Exception {
        return perform(patch("/api/super-admin/pumps/{pumpId}", setup.pumpId()), superAdmin,
                Map.of("pumpName", name, "pumpAddress", "Test address", "enabled", enabled));
    }

    private long openShift() throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }
}
