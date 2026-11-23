package com.ppms.shift;

import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.fuel.FuelType;
import com.ppms.pump.Nozzle;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** An operator sees only their own shifts and fuel transactions; other roles keep seeing the whole pump. */
class OperatorScopedAccessIntegrationTest extends ApiIntegrationTest {

    private PumpSetup setup;
    private User colleague;
    private long ownShiftId;
    private long colleagueShiftId;

    @BeforeEach
    void openOneShiftForEachOperator() throws Exception {
        setup = createPumpWithStock("1000");
        colleague = saveUser(UserRole.OPERATOR, setup.pumpId());
        Nozzle secondNozzle = nozzleRepository.save(Nozzle.builder()
                .duId(setup.du().getId())
                .nozzleNumber(2)
                .fuelType(FuelType.PETROL)
                .lastReading(new BigDecimal("500.000"))
                .tankId(setup.tank().getId())
                .build());
        ownShiftId = openShift(setup.operator(), setup.nozzle());
        colleagueShiftId = openShift(colleague, secondNozzle);
    }

    @Test
    void operatorSeesOnlyTheirOwnActiveShifts() throws Exception {
        assertThat(shiftIds(get("/api/pumps/{pumpId}/shifts/active", setup.pumpId()), setup.operator()))
                .containsExactly(ownShiftId);
        assertThat(shiftIds(get("/api/pumps/{pumpId}/shifts/active", setup.pumpId()), setup.manager()))
                .contains(ownShiftId, colleagueShiftId);
    }

    @Test
    void operatorHistoryHoldsOnlyTheirOwnShifts() throws Exception {
        JsonNode history = json(perform(get("/api/pumps/{pumpId}/shifts/history", setup.pumpId()), setup.operator())
                .andExpect(status().isOk()));
        List<Long> ids = new ArrayList<>();
        history.get("content").forEach(shift -> ids.add(shift.get("id").asLong()));

        assertThat(ids).contains(ownShiftId).doesNotContain(colleagueShiftId);
        assertThat(history.get("page").get("totalElements").asLong()).isEqualTo(ids.size());
    }

    @Test
    void operatorGetsNotFoundForAColleaguesShift() throws Exception {
        perform(get("/api/pumps/{pumpId}/shifts/{id}", setup.pumpId(), colleagueShiftId), setup.operator())
                .andExpect(status().isNotFound());
        perform(get("/api/pumps/{pumpId}/shifts/{id}", setup.pumpId(), ownShiftId), setup.operator())
                .andExpect(status().isOk());
        perform(get("/api/pumps/{pumpId}/shifts/{id}", setup.pumpId(), colleagueShiftId), setup.manager())
                .andExpect(status().isOk());
    }

    @Test
    void operatorRecordsFuelTransactionsOnlyAgainstTheirOwnOpenShift() throws Exception {
        recordTransaction(setup.operator(), ownShiftId).andExpect(status().isCreated());
        recordTransaction(setup.operator(), colleagueShiftId).andExpect(status().isNotFound());
        recordTransaction(setup.manager(), colleagueShiftId).andExpect(status().isCreated());
    }

    @Test
    void operatorReadsOnlyTheirOwnShiftsFuelTransactions() throws Exception {
        recordTransaction(setup.operator(), ownShiftId).andExpect(status().isCreated());
        recordTransaction(setup.manager(), colleagueShiftId).andExpect(status().isCreated());

        JsonNode pumpHistory = json(perform(get("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId()), setup.operator())
                .andExpect(status().isOk()));
        assertThat(pumpHistory.get("content")).allMatch(transaction -> transaction.get("shiftId").asLong() == ownShiftId);
        assertThat(pumpHistory.get("page").get("totalElements").asLong()).isEqualTo(1);

        perform(get("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId())
                .param("shiftId", String.valueOf(colleagueShiftId)), setup.operator())
                .andExpect(status().isNotFound());
        JsonNode managerHistory = json(perform(get("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(managerHistory.get("page").get("totalElements").asLong()).isEqualTo(2);
    }

    @Test
    void accountantReadsFuelTransactionsButCannotRecordThem() throws Exception {
        recordTransaction(setup.accountant(), ownShiftId).andExpect(status().isForbidden());
        perform(get("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId())
                .param("shiftId", String.valueOf(colleagueShiftId)), setup.accountant())
                .andExpect(status().isOk());
    }

    private ResultActions recordTransaction(User user, long shiftId) throws Exception {
        return perform(post("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId()), user,
                Map.of("shiftId", shiftId, "nozzleId", setup.nozzle().getId(), "fuelType", "PETROL",
                        "quantityLitres", new BigDecimal("10"), "pricePerUnit", new BigDecimal("100"),
                        "paymentMode", "CASH"));
    }

    private List<Long> shiftIds(MockHttpServletRequestBuilder request,
                                User user) throws Exception {
        List<Long> ids = new ArrayList<>();
        json(perform(request, user).andExpect(status().isOk())).forEach(shift -> ids.add(shift.get("id").asLong()));
        return ids;
    }

    private long openShift(User operator, Nozzle nozzle) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(nozzle.getId()), "operatorId", operator.getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }
}
