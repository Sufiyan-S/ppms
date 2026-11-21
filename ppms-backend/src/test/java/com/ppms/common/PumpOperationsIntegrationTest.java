package com.ppms.common;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.scheduler.InterestStagingJob;
import com.ppms.scheduler.NotificationGenerationJob;
import com.ppms.scheduler.NotificationRetentionJob;
import com.ppms.scheduler.OverdueShiftJob;
import com.ppms.scheduler.SettlementReminderJob;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PumpOperationsIntegrationTest extends ApiIntegrationTest {

    @Autowired private NotificationGenerationJob notificationGenerationJob;
    @Autowired private NotificationRetentionJob notificationRetentionJob;
    @Autowired private OverdueShiftJob overdueShiftJob;
    @Autowired private InterestStagingJob interestStagingJob;
    @Autowired private SettlementReminderJob settlementReminderJob;

    private PumpSetup setup;

    @BeforeEach
    void createPump() throws Exception {
        setup = createPumpWithStock("1000");
    }

    @Test
    void bankStatementImportSkipsUnreadableRowsAndLinesCanBeMatched() throws Exception {
        String date = TestDates.today().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        String csv = "Date,Description,Debit,Credit,Balance,Reference\n"
                + date + ",\"UPI settlement, batch 1\",,\"1,234.56\",\"10,000.00\",UTR1\n"
                + "not-a-date,Garbage,,5,,\n"
                + date + ",Bank charges,25.00,-,9975.00,CHG\n";
        MockMultipartFile file = new MockMultipartFile("file", "statement.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        JsonNode imported = json(mockMvc.perform(multipart("/api/pumps/{pumpId}/bank-reconciliation/import", setup.pumpId())
                        .file(file).param("bankName", "HDFC").cookie(loginAs(setup.owner())))
                .andExpect(status().is2xxSuccessful()));
        assertThat(imported.get("totalLines").asInt()).isEqualTo(2);

        JsonNode imports = json(perform(get("/api/pumps/{pumpId}/bank-reconciliation/imports", setup.pumpId()), setup.owner())
                .andExpect(status().isOk()));
        long importId = (imports.has("content") ? imports.get("content") : imports).get(0).get("id").asLong();
        JsonNode lines = json(perform(get("/api/pumps/{pumpId}/bank-reconciliation/imports/{id}/lines", setup.pumpId(), importId),
                setup.owner()).andExpect(status().isOk()));
        JsonNode lineList = lines.has("content") ? lines.get("content") : lines;
        assertThat(lineList.size()).isEqualTo(2);
        assertThat(lineList.get(0).get("creditAmount").decimalValue()).isEqualByComparingTo("1234.56");
        assertThat(lineList.get(1).get("debitAmount").decimalValue()).isEqualByComparingTo("25.00");
        assertThat(lineList.get(1).get("creditAmount").decimalValue()).isEqualByComparingTo("0");

        perform(patch("/api/pumps/{pumpId}/bank-reconciliation/lines/{lineId}", setup.pumpId(), lineList.get(0).get("id").asLong()),
                setup.owner(), Map.of("status", "IGNORED"))
                .andExpect(status().isOk());

        PumpSetup otherPump = createPumpWithStock("500");
        long otherPumpShiftId = openShift(otherPump);
        perform(patch("/api/pumps/{pumpId}/bank-reconciliation/lines/{lineId}", setup.pumpId(), lineList.get(1).get("id").asLong()),
                setup.owner(), Map.of("status", "MATCHED", "matchedShiftId", otherPumpShiftId))
                .andExpect(status().isNotFound());
        perform(patch("/api/pumps/{pumpId}/bank-reconciliation/lines/{lineId}", setup.pumpId(), lineList.get(1).get("id").asLong()),
                setup.owner(), Map.of("status", "MATCHED", "matchedShiftId", openShift()))
                .andExpect(status().isOk());
        mockMvc.perform(multipart("/api/pumps/{pumpId}/bank-reconciliation/import", setup.pumpId())
                        .file(file).param("bankName", "HDFC").cookie(loginAs(setup.manager())))
                .andExpect(status().isForbidden());
    }

    @Test
    void fuelSaleIsRecordedAgainstAnOpenShiftAndListedForIt() throws Exception {
        long shiftId = openShift();

        perform(post("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId()), setup.operator(),
                Map.of("shiftId", shiftId, "nozzleId", setup.nozzle().getId(), "fuelType", "PETROL",
                        "quantityLitres", new BigDecimal("12.5"), "pricePerUnit", new BigDecimal("100.00"),
                        "paymentMode", "UPI", "upiReference", "UTR123"))
                .andExpect(status().is2xxSuccessful());

        JsonNode transactions = json(perform(get("/api/pumps/{pumpId}/fuel-transactions", setup.pumpId())
                .param("shiftId", Long.toString(shiftId)), setup.manager()).andExpect(status().isOk()));
        assertThat(transactions.toString()).contains("UTR123");
    }

    @Test
    void meterReadingAdjustmentIsRefusedDuringAShiftAndAppliedAfter() throws Exception {
        long shiftId = openShift();
        Map<String, Object> adjustment = Map.of("adjustmentType", "CUSTOM_READING", "newReading", new BigDecimal("5000"),
                "reason", "Meter replaced");

        perform(post("/api/pumps/{pumpId}/nozzles/{nozzleId}/reading-adjustments", setup.pumpId(), setup.nozzle().getId()),
                setup.owner(), adjustment).andExpect(status().isBadRequest());

        Map<String, Object> close = new java.util.HashMap<>();
        close.put("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal("1000.000"))));
        close.put("cashCollected", BigDecimal.ZERO);
        close.put("upiCollected", BigDecimal.ZERO);
        close.put("cardCollected", BigDecimal.ZERO);
        close.put("fleetCardCollected", BigDecimal.ZERO);
        close.put("creditTotal", BigDecimal.ZERO);
        perform(post("/api/pumps/{pumpId}/shifts/{id}/close", setup.pumpId(), shiftId), setup.manager(), close)
                .andExpect(status().is2xxSuccessful());

        perform(post("/api/pumps/{pumpId}/nozzles/{nozzleId}/reading-adjustments", setup.pumpId(), setup.nozzle().getId()),
                setup.owner(), adjustment).andExpect(status().is2xxSuccessful());
        assertThat(nozzleRepository.findById(setup.nozzle().getId()).orElseThrow().getLastReading())
                .isEqualByComparingTo("5000");
        assertThat(json(perform(get("/api/pumps/{pumpId}/nozzles/{nozzleId}/reading-adjustments", setup.pumpId(),
                setup.nozzle().getId()), setup.owner()).andExpect(status().isOk())).toString()).contains("Meter replaced");
    }

    @Test
    void fuelDipLossIsRecordedAndListed() throws Exception {
        perform(post("/api/pumps/{pumpId}/fuel-dips", setup.pumpId()), setup.owner(),
                Map.of("fuelType", "PETROL", "litresRemoved", new BigDecimal("2.5"), "reason", "Quality sample",
                        "dipDate", TestDates.today().toString()))
                .andExpect(status().is2xxSuccessful());

        assertThat(json(perform(get("/api/pumps/{pumpId}/fuel-dips", setup.pumpId()), setup.owner())
                .andExpect(status().isOk())).toString()).contains("Quality sample");
    }

    @Test
    void plannerCanAddMoveAndRemoveEntriesOfAnUnpublishedPlan() throws Exception {
        LocalDate weekStart = TestDates.today().plusWeeks(2).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        long planId = json(perform(post("/api/pumps/{pumpId}/shift-plans/generate", setup.pumpId()), setup.owner(),
                Map.of("weekStart", weekStart.toString(), "operatorsPerDayShift", 1, "operatorsPerNightShift", 1))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();

        long cover = saveUser(UserRole.OPERATOR, setup.pumpId()).getId();
        long replacement = saveUser(UserRole.OPERATOR, setup.pumpId()).getId();
        JsonNode entry = json(perform(post("/api/pumps/{pumpId}/shift-plans/{planId}/entries", setup.pumpId(), planId), setup.owner(),
                Map.of("shiftDate", weekStart.plusDays(1).toString(), "shiftDefinitionId", setup.allDayShift().getId(),
                        "operatorUserId", cover, "note", "Cover"))
                .andExpect(status().is2xxSuccessful()));
        long entryId = entry.get("id").asLong();
        perform(patch("/api/pumps/{pumpId}/shift-plans/{planId}/entries/{entryId}", setup.pumpId(), planId, entryId),
                setup.owner(), Map.of("operatorUserId", replacement, "note", "Swapped")).andExpect(status().isOk());
        assertThat(planEntry(planId, entryId).get("operatorUserId").asLong()).isEqualTo(replacement);

        perform(delete("/api/pumps/{pumpId}/shift-plans/{planId}/entries/{entryId}", setup.pumpId(), planId, entryId),
                setup.owner()).andExpect(status().is2xxSuccessful());
        assertThat(planEntry(planId, entryId)).isNull();
    }

    private JsonNode planEntry(long planId, long entryId) throws Exception {
        JsonNode entries = json(perform(get("/api/pumps/{pumpId}/shift-plans/{planId}/entries", setup.pumpId(), planId),
                setup.owner()).andExpect(status().isOk()));
        for (JsonNode entry : entries) {
            if (entry.get("id").asLong() == entryId) {
                return entry;
            }
        }
        return null;
    }

    @Test
    void everyScheduledJobRunsAcrossAllPumpsWithoutFailing() {
        assertThatNoException().isThrownBy(() -> {
            notificationGenerationJob.generateNotificationsForAllPumps();
            notificationRetentionJob.deleteOldReadNotifications();
            overdueShiftJob.processOverdueShifts();
            interestStagingJob.stageWeeklyInterest();
            interestStagingJob.stageMonthlyInterest();
            settlementReminderJob.fireReminders();
        });
    }

    private long openShift() throws Exception {
        return openShift(setup);
    }

    private long openShift(PumpSetup pump) throws Exception {
        return json(perform(post("/api/pumps/{pumpId}/shifts/open", pump.pumpId()), pump.manager(),
                Map.of("duId", pump.du().getId(), "nozzleIds", List.of(pump.nozzle().getId()),
                        "operatorId", pump.operator().getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }
}
