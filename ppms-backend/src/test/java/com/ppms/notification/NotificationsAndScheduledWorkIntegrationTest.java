package com.ppms.notification;

import com.ppms.support.TestDates;
import com.fasterxml.jackson.databind.JsonNode;
import com.ppms.scheduler.OverdueShiftProcessor;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.ApiIntegrationTest;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NotificationsAndScheduledWorkIntegrationTest extends ApiIntegrationTest {

    @Autowired private NotificationService notificationService;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private NotificationDedupService notificationDedupService;
    @Autowired private OverdueShiftProcessor overdueShiftProcessor;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private PumpSetup setup;

    @BeforeEach
    void createPumpWithLowStock() throws Exception {
        setup = createPumpWithStock("1000");
    }

    @Test
    void lowTankStockRaisesOneUnreadAlertThatStaffCanMarkRead() throws Exception {
        notificationService.generateNotificationsForPump(setup.pumpId());
        notificationService.generateNotificationsForPump(setup.pumpId());

        JsonNode unread = json(perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()), setup.operator())
                .andExpect(status().isOk()));
        List<Long> lowStockIds = new ArrayList<>();
        for (JsonNode notification : unread.get("notifications")) {
            if ("LOW_STOCK".equals(notification.get("type").asText())) {
                lowStockIds.add(notification.get("id").asLong());
            }
        }
        assertThat(lowStockIds).hasSize(1);

        perform(post("/api/pumps/{pumpId}/notifications/mark-read", setup.pumpId()), setup.operator(),
                Map.of("ids", lowStockIds))
                .andExpect(status().is2xxSuccessful());

        assertThat(notificationIds(setup.operator())).doesNotContain(lowStockIds.get(0));
    }

    @Test
    void calibrationDueWithinAWeekAlertsOnceBeforeShiftsAreBlocked() throws Exception {
        perform(post("/api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations", setup.pumpId(), setup.nozzle().getId()),
                setup.owner(), Map.of("calibrationDate", TestDates.today().minusYears(1).toString(),
                        "nextCalibrationDue", TestDates.today().plusDays(3).toString(),
                        "calibratedBy", "Weights Dept", "certificateReference", "LM-2025-118"))
                .andExpect(status().is2xxSuccessful());

        notificationService.generateNotificationsForPump(setup.pumpId());
        notificationService.generateNotificationsForPump(setup.pumpId());

        List<Notification> dueSoon = notificationRepository.findAll().stream()
                .filter(notification -> notification.getPumpId().equals(setup.pumpId()))
                .filter(notification -> notification.getType() == NotificationType.CALIBRATION_DUE_SOON)
                .toList();
        assertThat(dueSoon).hasSize(1);
        assertThat(dueSoon.get(0).getMessage()).contains("Nozzle #1", TestDates.today().plusDays(3).toString());
        assertThat(notificationRepository.findAll()).noneMatch(notification ->
                notification.getPumpId().equals(setup.pumpId()) && notification.getType() == NotificationType.CALIBRATION_DUE);
    }

    @Test
    void calibrationDueLaterThanAWeekDoesNotAlertYet() throws Exception {
        perform(post("/api/pumps/{pumpId}/nozzles/{nozzleId}/calibrations", setup.pumpId(), setup.nozzle().getId()),
                setup.owner(), Map.of("calibrationDate", TestDates.today().toString(),
                        "nextCalibrationDue", TestDates.today().plusDays(8).toString(),
                        "calibratedBy", "Weights Dept", "certificateReference", "LM-2026-007"))
                .andExpect(status().is2xxSuccessful());

        notificationService.generateNotificationsForPump(setup.pumpId());

        assertThat(notificationRepository.findAll()).noneMatch(notification ->
                notification.getPumpId().equals(setup.pumpId())
                        && notification.getType() == NotificationType.CALIBRATION_DUE_SOON);
    }

    @Test
    void readingANotificationClearsItOnlyForTheReader() throws Exception {
        long lowStockId = insertNotification(NotificationType.LOW_STOCK);

        perform(post("/api/pumps/{pumpId}/notifications/mark-read", setup.pumpId()), setup.manager(),
                Map.of("ids", List.of(lowStockId)))
                .andExpect(status().is2xxSuccessful());

        assertThat(notificationIds(setup.manager())).doesNotContain(lowStockId);
        assertThat(notificationIds(setup.owner())).contains(lowStockId);
        assertThat(notificationIds(setup.operator())).contains(lowStockId);
    }

    @Test
    void historyListsReadAndUnreadNotificationsWithTheReadersOwnReadState() throws Exception {
        long readId = insertNotification(NotificationType.LOW_STOCK);
        long unreadId = insertNotification(NotificationType.LOW_STOCK);
        perform(post("/api/pumps/{pumpId}/notifications/mark-read", setup.pumpId()), setup.manager(),
                Map.of("ids", List.of(readId)))
                .andExpect(status().is2xxSuccessful());

        JsonNode managerHistory = history(setup.manager(), null);
        assertThat(readStateById(managerHistory)).containsEntry(readId, true).containsEntry(unreadId, false);
        assertThat(readStateById(history(setup.owner(), null))).containsEntry(readId, false);
        assertThat(managerHistory.get("totalElements").asLong()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void notificationsCarryThePageTheyOpen() throws Exception {
        notificationDedupService.maybeInsert(setup.pumpId(), NotificationType.ZERO_SALE_SHIFT,
                "ZERO_SALE_SHIFT:shift:4242", "Zero-Sale Shift Detected", "Shift #4242 recorded nothing",
                Map.of("shiftName", "Morning", "shiftId", 4242));

        JsonNode unread = json(perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        JsonNode zeroSale = findByType(unread.get("notifications"), "ZERO_SALE_SHIFT");
        assertThat(zeroSale.get("target").get("route").asText()).isEqualTo("/dashboard/shifts");
        assertThat(zeroSale.get("target").get("params").get("shift").asText()).isEqualTo("4242");
        assertThat(zeroSale.get("read").asBoolean()).isFalse();
        assertThat(zeroSale.has("createdAt")).isTrue();
    }

    @Test
    void notificationsCarryTheCodeAndParamsTheirTextWasBuiltFrom() throws Exception {
        notificationDedupService.maybeInsert(setup.pumpId(), NotificationType.DOCUMENT_EXPIRING,
                "DOCUMENT_EXPIRING:doc:77:2026-01-01:EXPIRED", "Document Expired", "Licence (LICENCE) expired on 2026-01-01",
                Map.of("documentName", "Licence", "documentType", "LICENCE", "expiryDate", "2026-01-01"));

        JsonNode unread = json(perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        JsonNode expired = findByType(unread.get("notifications"), "DOCUMENT_EXPIRING");
        assertThat(expired.get("code").asText()).isEqualTo("DOCUMENT_EXPIRED");
        assertThat(expired.get("params").get("documentName").asText()).isEqualTo("Licence");
        assertThat(expired.get("params").get("expiryDate").asText()).isEqualTo("2026-01-01");
        assertThat(expired.get("message").asText()).isEqualTo("Licence (LICENCE) expired on 2026-01-01");
    }

    @Test
    void historyCanBeNarrowedToOneTypeAndOnlyShowsTypesTheRoleReceives() throws Exception {
        long lowStockId = insertNotification(NotificationType.LOW_STOCK);
        long zeroSaleId = insertNotification(NotificationType.ZERO_SALE_SHIFT);

        assertThat(readStateById(history(setup.manager(), "LOW_STOCK"))).containsKey(lowStockId).doesNotContainKey(zeroSaleId);
        assertThat(readStateById(history(setup.operator(), null))).containsKey(lowStockId).doesNotContainKey(zeroSaleId);
        assertThat(history(setup.operator(), "ZERO_SALE_SHIFT").get("content")).isEmpty();
    }

    @Test
    void operatorsAndAccountantsDoNotReceiveShiftIntegrityAlertsAndCannotDismissThem() throws Exception {
        long zeroSaleId = insertNotification(NotificationType.ZERO_SALE_SHIFT);
        long autoClosedId = insertNotification(NotificationType.AUTO_CLOSED_SHIFT);

        assertThat(notificationIds(setup.operator())).doesNotContain(zeroSaleId, autoClosedId);
        assertThat(notificationIds(setup.accountant())).doesNotContain(zeroSaleId, autoClosedId);
        assertThat(notificationIds(setup.manager())).contains(zeroSaleId, autoClosedId);

        JsonNode marked = json(perform(post("/api/pumps/{pumpId}/notifications/mark-read", setup.pumpId()),
                setup.operator(), Map.of("ids", List.of(zeroSaleId)))
                .andExpect(status().is2xxSuccessful()));
        assertThat(marked.get("marked").asInt()).isZero();
        assertThat(notificationIds(setup.owner())).contains(zeroSaleId);
    }

    @Test
    void notificationsFirstReadBeforeTheRetentionWindowAreDeletedAndUnreadOnesKept() throws Exception {
        long oldRead = insertNotification(NotificationType.LOW_STOCK);
        long recentRead = insertNotification(NotificationType.LOW_STOCK);
        long neverRead = insertNotification(NotificationType.LOW_STOCK);
        perform(post("/api/pumps/{pumpId}/notifications/mark-read", setup.pumpId()), setup.manager(),
                Map.of("ids", List.of(oldRead, recentRead)))
                .andExpect(status().is2xxSuccessful());
        jdbcTemplate.update("UPDATE notification_reads SET read_at = ? WHERE notification_id = ?",
                TestDates.now().minusDays(120), oldRead);
        jdbcTemplate.update("UPDATE notifications SET created_at = ? WHERE id = ?",
                TestDates.now().minusDays(200), neverRead);

        int deleted = notificationService.deleteReadBatchOlderThan(90, 100);

        assertThat(deleted).isGreaterThanOrEqualTo(1);
        assertThat(notificationRepository.findById(oldRead)).isEmpty();
        assertThat(notificationRepository.findById(recentRead)).isPresent();
        assertThat(notificationRepository.findById(neverRead)).isPresent();
    }

    @Test
    void openShiftPastItsScheduledEndIsFlaggedOverdueAndThenAutoClosed() throws Exception {
        long shiftId = openShift(setup.operator());
        Shift shift = shiftRepository.findById(shiftId).orElseThrow();
        shift.setShiftDate(shift.getShiftDate().minusDays(1));
        shiftRepository.save(shift);
        OffsetDateTime now = TestDates.now();

        assertThat(overdueShiftProcessor.process(shiftId, now)).isEqualTo(OverdueShiftProcessor.Outcome.MARKED_OVERDUE);
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN_OVERDUE);

        assertThat(overdueShiftProcessor.process(shiftId, now)).isEqualTo(OverdueShiftProcessor.Outcome.AUTO_CLOSED);
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.AUTO_CLOSED_OVERDUE);
    }

    @Test
    void shiftStillInsideItsWindowIsLeftOpen() throws Exception {
        long shiftId = openShift(setup.operator());

        assertThat(overdueShiftProcessor.process(shiftId, TestDates.now()))
                .isEqualTo(OverdueShiftProcessor.Outcome.UNCHANGED);
        assertThat(shiftRepository.findById(shiftId).orElseThrow().getStatus()).isEqualTo(ShiftStatus.OPEN);
    }

    @Test
    void handoverToAnotherOperatorOfThePumpIsRecordedAndListed() throws Exception {
        long shiftId = openShift(setup.operator());
        User incoming = saveUser(UserRole.OPERATOR, setup.pumpId());

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                Map.of("outgoingShiftId", shiftId, "incomingOperatorId", incoming.getId(), "notes", "Lunch break",
                        "closing", balancedClosing()))
                .andExpect(status().is2xxSuccessful());

        JsonNode handovers = json(perform(get("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager())
                .andExpect(status().isOk()));
        assertThat(handovers.toString()).contains("Lunch break");
    }

    @Test
    void handoverToAnOperatorOfAnotherPumpIsRefused() throws Exception {
        long shiftId = openShift(setup.operator());
        User outsider = saveUser(UserRole.OPERATOR, null);

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(),
                Map.of("outgoingShiftId", shiftId, "incomingOperatorId", outsider.getId()))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void onlyAManagerOrAboveCanHandAShiftOverBecauseItClosesTheShift() throws Exception {
        long shiftId = openShift(setup.operator());
        User incoming = saveUser(UserRole.OPERATOR, setup.pumpId());
        Map<String, Object> handover = Map.of("outgoingShiftId", shiftId, "incomingOperatorId", incoming.getId(),
                "closing", balancedClosing());

        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.operator(), handover)
                .andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.accountant(), handover)
                .andExpect(status().isForbidden());
        perform(post("/api/pumps/{pumpId}/handovers", setup.pumpId()), setup.manager(), handover)
                .andExpect(status().is2xxSuccessful());
    }

    private Map<String, Object> balancedClosing() {
        return Map.of("fuelReadings", List.of(Map.of("nozzleId", setup.nozzle().getId(), "endReading", new BigDecimal("1000.000"))),
                "cashCollected", BigDecimal.ZERO, "upiCollected", BigDecimal.ZERO, "cardCollected", BigDecimal.ZERO,
                "fleetCardCollected", BigDecimal.ZERO, "creditTotal", BigDecimal.ZERO);
    }

    private long insertNotification(NotificationType type) {
        String dedupKey = type + ":test:" + shortId();
        notificationDedupService.maybeInsert(setup.pumpId(), type, dedupKey, "Test alert", "Test message", Map.of());
        return notificationRepository.findAll().stream()
                .filter(notification -> dedupKey.equals(notification.getDedupKey()))
                .findFirst()
                .orElseThrow()
                .getId();
    }

    private JsonNode history(User user, String type) throws Exception {
        var request = get("/api/pumps/{pumpId}/notifications/history", setup.pumpId()).param("size", "200");
        if (type != null) {
            request.param("type", type);
        }
        return json(perform(request, user).andExpect(status().isOk()));
    }

    private static Map<Long, Boolean> readStateById(JsonNode page) {
        Map<Long, Boolean> readState = new HashMap<>();
        page.get("content").forEach(notification ->
                readState.put(notification.get("id").asLong(), notification.get("read").asBoolean()));
        return readState;
    }

    private static JsonNode findByType(JsonNode notifications, String type) {
        for (JsonNode notification : notifications) {
            if (type.equals(notification.get("type").asText())) {
                return notification;
            }
        }
        throw new AssertionError("No " + type + " notification in " + notifications);
    }

    private List<Long> notificationIds(User user) throws Exception {
        JsonNode response = json(perform(get("/api/pumps/{pumpId}/notifications", setup.pumpId()), user)
                .andExpect(status().isOk()));
        List<Long> ids = new ArrayList<>();
        response.get("notifications").forEach(notification -> ids.add(notification.get("id").asLong()));
        return ids;
    }

    private long openShift(User operator) throws Exception {

        return json(perform(post("/api/pumps/{pumpId}/shifts/open", setup.pumpId()), setup.manager(),
                Map.of("duId", setup.du().getId(), "nozzleIds", List.of(setup.nozzle().getId()),
                        "operatorId", operator.getId()))
                .andExpect(status().is2xxSuccessful())).get("id").asLong();
    }
}
