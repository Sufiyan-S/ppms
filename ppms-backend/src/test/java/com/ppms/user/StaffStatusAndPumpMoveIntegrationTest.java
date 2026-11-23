package com.ppms.user;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditLogRepository;
import com.ppms.planning.PreferredDayOff;
import com.ppms.planning.ShiftPlan;
import com.ppms.planning.ShiftPlanEntry;
import com.ppms.planning.ShiftPlanEntryRepository;
import com.ppms.planning.ShiftPlanEntryStatus;
import com.ppms.planning.ShiftPlanRepository;
import com.ppms.planning.ShiftPlanStatus;
import com.ppms.planning.StaffLeave;
import com.ppms.planning.StaffLeaveRepository;
import com.ppms.planning.StaffPreference;
import com.ppms.planning.StaffPreferenceRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.support.TestDates;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Staff are enabled and disabled with the body the web app sends, and an owner moves staff between their pumps. */
class StaffStatusAndPumpMoveIntegrationTest extends ApiIntegrationTest {

    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private ShiftPlanRepository planRepository;
    @Autowired private ShiftPlanEntryRepository entryRepository;
    @Autowired private StaffLeaveRepository leaveRepository;
    @Autowired private StaffPreferenceRepository preferenceRepository;

    private PumpSetup setup;
    private PumpLocation secondPump;

    @BeforeEach
    void createTwoPumpsOfOneOwner() throws Exception {
        setup = createPumpWithStock("1000");
        secondPump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(setup.owner().getId()).name("Second " + shortId()).address("Ring road").maxDuCount(2).build());
    }

    @Test
    void ownerDisablesAndEnablesStaffWithTheStatusInTheBody() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());

        changeStatus(operator, "INACTIVE").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        changeStatus(operator, "ACTIVE").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        perform(patch("/api/users/{userId}/status", operator.getId()), setup.owner(), Map.of())
                .andExpect(status().isBadRequest());

        assertThat(userRepository.findById(operator.getId()).orElseThrow().getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void ownerMovesStaffToAnotherOfTheirPumpsWhichEndsTheirSessionAndIsAuditedAtBothPumps() throws Exception {
        User manager = saveUser(UserRole.MANAGER, setup.pumpId());
        Cookie oldSession = loginAs(manager);

        moveToPump(manager, secondPump.getId(), setup.owner())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedPumpId").value(secondPump.getId()));

        assertThat(userRepository.findById(manager.getId()).orElseThrow().getAssignedPumpId()).isEqualTo(secondPump.getId());
        mockMvc.perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()).cookie(oldSession))
                .andExpect(status().isUnauthorized());
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .anySatisfy(log -> assertThat(log.getAction()).isEqualTo(AuditAction.USER_PUMP_CHANGED));
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(secondPump.getId()))
                .anySatisfy(log -> assertThat(log.getAction()).isEqualTo(AuditAction.USER_PUMP_CHANGED));
    }

    @Test
    void movedOperatorLosesUpcomingPlannedShiftsLeaveAndPreferenceAtTheOldPumpButKeepsPastOnes() throws Exception {
        User operator = saveUser(UserRole.OPERATOR, setup.pumpId());
        User colleague = saveUser(UserRole.OPERATOR, setup.pumpId());
        LocalDate today = TestDates.today();
        ShiftPlan publishedPlan = planRepository.save(ShiftPlan.builder()
                .pumpId(setup.pumpId()).weekStart(today.minusDays(3)).status(ShiftPlanStatus.PUBLISHED)
                .operatorsPerDayShift(1).operatorsPerNightShift(1).build());
        ShiftPlanEntry yesterdaysShift = savePlanEntry(publishedPlan, operator, today.minusDays(1));
        savePlanEntry(publishedPlan, operator, today);
        savePlanEntry(publishedPlan, operator, today.plusDays(2));
        ShiftPlanEntry colleaguesShift = savePlanEntry(publishedPlan, colleague, today.plusDays(2));
        StaffLeave pastLeave = leaveRepository.save(StaffLeave.builder()
                .userId(operator.getId()).pumpId(setup.pumpId()).leaveDate(today.minusDays(2)).build());
        leaveRepository.save(StaffLeave.builder()
                .userId(operator.getId()).pumpId(setup.pumpId()).leaveDate(today.plusDays(1)).build());
        preferenceRepository.save(StaffPreference.builder()
                .userId(operator.getId()).pumpId(setup.pumpId()).preferredDayOff(PreferredDayOff.SUNDAY).build());

        moveToPump(operator, secondPump.getId(), setup.owner()).andExpect(status().isOk());

        assertThat(entryRepository.findByShiftPlanId(publishedPlan.getId()))
                .extracting(ShiftPlanEntry::getId)
                .containsExactlyInAnyOrder(yesterdaysShift.getId(), colleaguesShift.getId());
        assertThat(leaveRepository.findByUserIdOrderByLeaveDateDesc(operator.getId()))
                .extracting(StaffLeave::getId)
                .containsExactly(pastLeave.getId());
        assertThat(preferenceRepository.findByUserId(operator.getId())).isEmpty();
        assertThat(auditLogRepository.findByPumpIdOrderByCreatedAtDesc(setup.pumpId()))
                .filteredOn(log -> log.getAction() == AuditAction.USER_PUMP_CHANGED)
                .singleElement()
                .satisfies(log -> assertThat(log.getDescription()).contains("2 upcoming planned shift(s)"));
    }

    @Test
    void operatorWithAnOpenShiftCannotBeMoved() throws Exception {
        perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", setup.operator().getId()))
                .andExpect(status().is2xxSuccessful());

        moveToPump(setup.operator(), secondPump.getId(), setup.owner())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("has an open shift")));

        assertThat(userRepository.findById(setup.operator().getId()).orElseThrow().getAssignedPumpId())
                .isEqualTo(setup.pumpId());
    }

    @Test
    void onlyTheOwnerCanMoveStaffAndOnlyToTheirOwnPump() throws Exception {
        PumpLocation strangersPump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(saveUser(UserRole.OWNER, null).getId()).name("Other " + shortId()).address("Elsewhere")
                .maxDuCount(1).build());

        moveToPump(setup.accountant(), secondPump.getId(), setup.admin()).andExpect(status().isForbidden());
        moveToPump(setup.accountant(), strangersPump.getId(), setup.owner())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("another pump you own")));

        assertThat(userRepository.findById(setup.accountant().getId()).orElseThrow().getAssignedPumpId())
                .isEqualTo(setup.pumpId());
    }

    @Test
    void pumpWithOnlyDeactivatedStaffIsNotDeletedUntilTheyAreMoved() throws Exception {
        User formerOperator = saveUser(UserRole.OPERATOR, secondPump.getId());
        changeStatus(formerOperator, "INACTIVE").andExpect(status().isOk());

        perform(delete("/api/pumps/{pumpId}", secondPump.getId()), setup.owner())
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("deactivated staff")));

        moveToPump(formerOperator, setup.pumpId(), setup.owner()).andExpect(status().isOk());
        perform(delete("/api/pumps/{pumpId}", secondPump.getId()), setup.owner()).andExpect(status().isNoContent());
    }

    private ShiftPlanEntry savePlanEntry(ShiftPlan plan, User operator, LocalDate shiftDate) {
        return entryRepository.save(ShiftPlanEntry.builder()
                .shiftPlanId(plan.getId()).shiftDate(shiftDate).shiftDefinitionId(setup.allDayShift().getId())
                .operatorUserId(operator.getId()).status(ShiftPlanEntryStatus.PLANNED).build());
    }

    private ResultActions changeStatus(User user, String status) throws Exception {
        return perform(patch("/api/users/{userId}/status", user.getId()), setup.owner(), Map.of("status", status));
    }

    private ResultActions moveToPump(User user, Long pumpId, User actor) throws Exception {
        return perform(patch("/api/users/{userId}/assigned-pump", user.getId()), actor, Map.of("pumpId", pumpId));
    }
}
