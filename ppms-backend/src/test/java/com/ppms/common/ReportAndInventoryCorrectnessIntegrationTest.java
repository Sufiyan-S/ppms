package com.ppms.common;

import com.ppms.support.TestDates;
import com.ppms.adjustment.FuelDipEntry;
import com.ppms.adjustment.FuelDipEntryRepository;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.expense.ExpenseCategory;
import com.ppms.expense.PumpExpense;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.fuel.FuelType;
import com.ppms.fuel.GlobalFuelPrice;
import com.ppms.fuel.GlobalFuelPriceRepository;
import com.ppms.inventory.DipCheck;
import com.ppms.inventory.DipCheckRepository;
import com.ppms.inventory.DipCheckStatus;
import com.ppms.inventory.InventoryWorkflowService;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumption;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.LotConsumptionSource;
import com.ppms.inventory.LotStatus;
import com.ppms.inventory.RecordDipCheckRequest;
import com.ppms.inventory.TankerDelivery;
import com.ppms.inventory.TankerDeliveryRepository;
import com.ppms.inventory.UpdateDeliveryRequest;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.report.BalanceSheetDetailResponse;
import com.ppms.report.BalanceSheetReportType;
import com.ppms.report.BalanceSheetService;
import com.ppms.report.BsFuelLineResponse;
import com.ppms.report.GenerateBalanceSheetRequest;
import com.ppms.common.exception.BusinessException;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftFuelDeductionService;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class ReportAndInventoryCorrectnessIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private BalanceSheetService balanceSheetService;
    @Autowired private InventoryWorkflowService inventoryWorkflowService;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private DispensaryUnitRepository duRepository;
    @Autowired private NozzleRepository nozzleRepository;
    @Autowired private UndergroundTankRepository tankRepository;
    @Autowired private InventoryLotRepository inventoryLotRepository;
    @Autowired private LotConsumptionRepository lotConsumptionRepository;
    @Autowired private TankerDeliveryRepository tankerDeliveryRepository;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private ShiftFuelReadingRepository fuelReadingRepository;
    @Autowired private GlobalFuelPriceRepository fuelPriceRepository;
    @Autowired private FuelDipEntryRepository fuelDipEntryRepository;
    @Autowired private DipCheckRepository dipCheckRepository;
    @Autowired private PumpExpenseRepository expenseRepository;
    @Autowired private ShiftFuelDeductionService fuelDeductionService;
    @Autowired private TransactionTemplate transactionTemplate;

    private final LocalDate today = LocalDate.now(IST);
    private User owner;
    private User operator;
    private PumpLocation pump;
    private UndergroundTank tank;
    private DispensaryUnit du;
    private Nozzle nozzle;

    @BeforeEach
    void createPumpWithPricedTank() {
        owner = saveUser(UserRole.OWNER, null);
        pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(4)
                .build());
        operator = saveUser(UserRole.OPERATOR, pump.getId());
        tank = tankRepository.save(UndergroundTank.builder()
                .pumpId(pump.getId())
                .tankIdentifier("T-" + shortId())
                .fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("20000"))
                .currentStock(BigDecimal.ZERO)
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
        du = duRepository.save(DispensaryUnit.builder().pumpId(pump.getId()).duNumber(1).name("DU-" + shortId()).build());
        nozzle = nozzleRepository.save(Nozzle.builder()
                .duId(du.getId()).nozzleNumber(1).fuelType(FuelType.PETROL)
                .lastReading(BigDecimal.ZERO).tankId(tank.getId()).build());
        fuelPriceRepository.save(GlobalFuelPrice.builder()
                .pumpId(pump.getId()).fuelType(FuelType.PETROL).pricePerUnit(new BigDecimal("100.00"))
                .effectiveFrom(at(today.minusDays(30), "00:00")).setByUserId(owner.getId()).build());
    }

    @Test
    void historicalDayReportShowsTheStockOfItsOwnDay() {
        LocalDate dayOne = today.minusDays(3);
        LocalDate dayTwo = today.minusDays(2);
        InventoryLot firstLot = saveLot("1000.000", at(dayOne, "06:00"));
        closedShiftConsuming(firstLot, "100.000", dayOne);
        InventoryLot secondLot = saveLot("500.000", at(dayTwo, "06:00"));
        closedShiftConsuming(secondLot, "50.000", dayTwo);

        BsFuelLineResponse dayOneLine = petrolLine(generateDay(dayOne));
        BsFuelLineResponse dayTwoLine = petrolLine(generateDay(dayTwo));

        assertThat(dayOneLine.getOpeningStock()).isEqualByComparingTo("0.000");
        assertThat(dayOneLine.getClosingStock()).isEqualByComparingTo("900.000");
        assertThat(dayTwoLine.getOpeningStock()).isEqualByComparingTo("900.000");
        assertThat(dayTwoLine.getClosingStock()).isEqualByComparingTo("1350.000");
    }

    @Test
    void liveDayReportCountsOnlyDipEntriesRecordedInItsWindow() {
        InventoryLot lot = saveLot("1000.000", OffsetDateTime.now(IST).minusDays(2));
        Shift shift = closedShiftConsuming(lot, "10.000", today);
        shift.setActualStartTime(OffsetDateTime.now(IST).minusHours(3));
        shift.setActualEndTime(OffsetDateTime.now(IST).minusHours(1));
        shiftRepository.save(shift);
        FuelDipEntry olderThanWindow = saveDipEntry("30.00", today.minusDays(1));
        jdbcTemplate.update("UPDATE fuel_dip_entries SET created_at = ? WHERE id = ?",
                OffsetDateTime.now(IST).minusHours(30), olderThanWindow.getId());
        saveDipEntry("20.00", today);

        BalanceSheetDetailResponse live = generateDay(today);

        assertThat(live.getPeriodLabel()).contains("→");
        assertThat(petrolLine(live).getDipLossAmount()).isEqualByComparingTo("20.00");
    }

    @Test
    void savedSheetTotalsDoNotChangeAfterAPriceChangeOrALateExpense() {
        LocalDate day = today.minusDays(2);
        InventoryLot lot = saveLot("1000.000", at(day.minusDays(1), "06:00"));
        closedShiftConsuming(lot, "100.000", day);
        dipCheckRepository.save(DipCheck.builder()
                .pumpId(pump.getId()).tankId(tank.getId())
                .measuredQuantity(new BigDecimal("890.000")).systemStock(new BigDecimal("900.000"))
                .checkedAt(at(day, "20:00")).loggedByUserId(owner.getId())
                .status(DipCheckStatus.WITHIN_TOLERANCE).build());

        BalanceSheetDetailResponse generated = generateDay(day);
        fuelPriceRepository.save(GlobalFuelPrice.builder()
                .pumpId(pump.getId()).fuelType(FuelType.PETROL).pricePerUnit(new BigDecimal("150.00"))
                .setByUserId(owner.getId()).build());
        expenseRepository.save(PumpExpense.builder()
                .pumpId(pump.getId()).category(ExpenseCategory.MAINTENANCE).amount(new BigDecimal("500.00"))
                .description("Late approval").expenseDate(day).recordedByUserId(owner.getId())
                .approvalStatus(ExpenseApprovalStatus.APPROVED).build());

        BalanceSheetDetailResponse reopened = balanceSheetService.getById(pump.getId(), generated.getId());

        assertThat(generated.getTotalDipNetAmount()).isEqualByComparingTo("-1000.00");
        assertThat(reopened.getTotalDipNetAmount()).isEqualByComparingTo(generated.getTotalDipNetAmount());
        assertThat(reopened.getTotalNetProfit()).isEqualByComparingTo(generated.getTotalNetProfit());
        assertThat(reopened.isLinesChangedSinceGenerated()).isTrue();
    }

    @Test
    void deliveryDatedAtMidnightOfTheNextDayStaysOutOfTheEarlierDay() {
        LocalDate day = today.minusDays(3);
        InventoryLot opening = saveLot("1000.000", at(day.minusDays(1), "00:00"));
        closedShiftConsuming(opening, "100.000", day);
        saveDelivery("500.000", day.plusDays(1));
        closedShiftConsuming(opening, "10.000", day.plusDays(1));

        BsFuelLineResponse dayLine = petrolLine(generateDay(day));
        BsFuelLineResponse nextDayLine = petrolLine(generateDay(day.plusDays(1)));

        assertThat(dayLine.getDeliveredLitres()).isEqualByComparingTo("0");
        assertThat(dayLine.getClosingStock()).isEqualByComparingTo("900.000");
        assertThat(nextDayLine.getDeliveredLitres()).isEqualByComparingTo("500.000");
        assertThat(nextDayLine.getOpeningStock()).isEqualByComparingTo("900.000");
    }

    @Test
    void historicalDayWithANightShiftBalancesOpeningSalesAndClosing() {
        LocalDate day = today.minusDays(3);
        InventoryLot lot = saveLot("1000.000", at(day.minusDays(1), "00:00"));
        closedShiftConsuming(lot, "100.000", day);
        Shift night = closedShiftConsuming(lot, "300.000", day);
        night.setActualStartTime(at(day, "22:00"));
        night.setActualEndTime(at(day.plusDays(1), "06:00"));
        shiftRepository.save(night);

        BsFuelLineResponse dayLine = petrolLine(generateDay(day));

        assertThat(dayLine.getOpeningStock()).isEqualByComparingTo("1000.000");
        assertThat(dayLine.getSoldLitres()).isEqualByComparingTo("400.000");
        assertThat(dayLine.getClosingStock()).isEqualByComparingTo("600.000");
    }

    @Test
    void backfillStockExcludesLotsDeliveredOnTheFollowingDay() {
        LocalDate day = today.minusDays(3);
        saveLot("100.000", at(day, "00:00"));
        saveLot("500.000", at(day.plusDays(1), "00:00"));

        BigDecimal available = transactionTemplate.execute(status -> fuelDeductionService.availableStockAsOf(
                pump.getId(), FuelType.PETROL, tank.getId(), at(day.plusDays(1), "00:00")));

        assertThat(available).isEqualByComparingTo("100.000");
    }

    @Test
    void dipGainIsCostedAtTheLastRealDeliveryNotADipAdjustmentLot() {
        InventoryLot delivered = saveLot("1000.000", at(today.minusDays(5), "00:00"));
        delivered.setRemainingQuantity(BigDecimal.ZERO.setScale(3));
        delivered.setStatus(LotStatus.EXHAUSTED);
        inventoryLotRepository.save(delivered);
        InventoryLot zeroCostAdjustment = saveLot("100.000", at(today.minusDays(1), "00:00"));
        zeroCostAdjustment.setIsDipAdjustment(true);
        zeroCostAdjustment.setCostPricePerUnit(BigDecimal.ZERO);
        inventoryLotRepository.save(zeroCostAdjustment);
        tank.setCurrentStock(new BigDecimal("100.000"));
        tankRepository.save(tank);
        RecordDipCheckRequest request = new RecordDipCheckRequest();
        request.setTankId(tank.getId());
        request.setMeasuredQuantity(new BigDecimal("150"));
        request.setCheckedAt(today);

        inventoryWorkflowService.recordDipCheck(pump.getId(), request, owner);

        InventoryLot gainLot = inventoryLotRepository.findActiveLotsByTankForDisplay(tank.getId()).stream()
                .filter(lot -> lot.getOriginalQuantity().compareTo(new BigDecimal("50.000")) == 0)
                .findFirst()
                .orElseThrow();
        assertThat(gainLot.getCostPricePerUnit()).isEqualByComparingTo("90.00");
    }

    @Test
    void deliveryCannotBeMovedAfterItsFuelWasFirstUsed() {
        LocalDate deliveryDay = today.minusDays(4);
        TankerDelivery delivery = saveDelivery("1000.000", deliveryDay);
        InventoryLot lot = inventoryLotRepository.findByTankerDeliveryId(delivery.getId()).orElseThrow();
        closedShiftConsuming(lot, "100.000", deliveryDay);
        UpdateDeliveryRequest moveLater = new UpdateDeliveryRequest();
        moveLater.setQuantityDelivered(new BigDecimal("1000"));
        moveLater.setCostPricePerUnit(new BigDecimal("90.00"));
        moveLater.setDeliveryDate(deliveryDay.plusDays(2));
        moveLater.setInvoiceReference(delivery.getInvoiceReference());

        assertThatThrownBy(() -> inventoryWorkflowService.updateDelivery(pump.getId(), delivery.getId(), moveLater, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already used");
    }

    @Test
    void correctingAnExhaustedDeliveryUpwardMakesItsLotUsableAgain() {
        LocalDate deliveryDay = today.minusDays(1);
        TankerDelivery delivery = tankerDeliveryRepository.save(TankerDelivery.builder()
                .pumpId(pump.getId()).tankId(tank.getId()).fuelType(FuelType.PETROL)
                .quantityDelivered(new BigDecimal("1000.000")).costPricePerUnit(new BigDecimal("90.00"))
                .deliveryDate(at(deliveryDay, "00:00")).invoiceReference("INV-" + shortId())
                .loggedByUserId(owner.getId()).build());
        InventoryLot lot = inventoryLotRepository.save(InventoryLot.builder()
                .tankerDeliveryId(delivery.getId()).tankId(tank.getId()).fuelType(FuelType.PETROL)
                .pumpId(pump.getId()).originalQuantity(new BigDecimal("1000.000"))
                .remainingQuantity(BigDecimal.ZERO.setScale(3)).costPricePerUnit(new BigDecimal("90.00"))
                .deliveryDate(at(deliveryDay, "00:00")).isDipAdjustment(false).status(LotStatus.EXHAUSTED)
                .build());
        UpdateDeliveryRequest correction = new UpdateDeliveryRequest();
        correction.setQuantityDelivered(new BigDecimal("1200"));
        correction.setCostPricePerUnit(new BigDecimal("90.00"));
        correction.setDeliveryDate(deliveryDay);
        correction.setInvoiceReference(delivery.getInvoiceReference());

        inventoryWorkflowService.updateDelivery(pump.getId(), delivery.getId(), correction, owner);

        InventoryLot corrected = inventoryLotRepository.findById(lot.getId()).orElseThrow();
        assertThat(corrected.getRemainingQuantity()).isEqualByComparingTo("200.000");
        assertThat(corrected.getStatus()).isEqualTo(LotStatus.ACTIVE);
        assertThat(inventoryLotRepository.findActiveLotsByTankForDisplay(tank.getId())).extracting(InventoryLot::getId)
                .contains(lot.getId());
    }

    private BalanceSheetDetailResponse generateDay(LocalDate reportDate) {
        GenerateBalanceSheetRequest request = new GenerateBalanceSheetRequest();
        request.setReportType(BalanceSheetReportType.DAY);
        request.setReportDate(reportDate);
        return balanceSheetService.generate(pump.getId(), request, owner);
    }

    private BsFuelLineResponse petrolLine(BalanceSheetDetailResponse sheet) {
        return sheet.getFuelLines().stream()
                .filter(line -> line.getFuelType().equals(FuelType.PETROL.name()))
                .findFirst()
                .orElseThrow();
    }

    private InventoryLot saveLot(String litres, OffsetDateTime deliveredAt) {
        return inventoryLotRepository.save(InventoryLot.builder()
                .tankId(tank.getId()).fuelType(FuelType.PETROL).pumpId(pump.getId())
                .originalQuantity(new BigDecimal(litres)).remainingQuantity(new BigDecimal(litres))
                .costPricePerUnit(new BigDecimal("90.00")).deliveryDate(deliveredAt)
                .isDipAdjustment(false).status(LotStatus.ACTIVE).build());
    }

    private Shift closedShiftConsuming(InventoryLot lot, String litres, LocalDate shiftDate) {
        BigDecimal sold = new BigDecimal(litres);
        BigDecimal due = sold.multiply(new BigDecimal("100.00")).setScale(2);
        Shift shift = shiftRepository.save(Shift.builder()
                .pumpId(pump.getId()).duId(du.getId()).operatorId(operator.getId()).openedByUserId(owner.getId())
                .closedByUserId(owner.getId()).shiftName("Day").shiftDate(shiftDate)
                .actualStartTime(at(shiftDate, "09:00")).actualEndTime(at(shiftDate, "17:00"))
                .totalAmountDue(due).cashCollected(due).upiCollected(BigDecimal.ZERO)
                .cardCollected(BigDecimal.ZERO).creditTotal(BigDecimal.ZERO)
                .status(ShiftStatus.CLOSED_BALANCED).isOverdueFlag(false).build());
        fuelReadingRepository.save(ShiftFuelReading.builder()
                .shiftId(shift.getId()).nozzleId(nozzle.getId()).fuelType(FuelType.PETROL).tankId(tank.getId())
                .startReading(BigDecimal.ZERO).endReading(sold).unitsSold(sold)
                .priceSnapshot(new BigDecimal("100.00")).build());
        lot.setRemainingQuantity(lot.getRemainingQuantity().subtract(sold));
        inventoryLotRepository.save(lot);
        lotConsumptionRepository.save(LotConsumption.builder()
                .lotId(lot.getId()).sourceType(LotConsumptionSource.SHIFT_CLOSE).shiftId(shift.getId())
                .quantityConsumed(sold).costPricePerUnit(lot.getCostPricePerUnit()).build());
        return shift;
    }

    private TankerDelivery saveDelivery(String litres, LocalDate deliveryDay) {
        TankerDelivery delivery = tankerDeliveryRepository.save(TankerDelivery.builder()
                .pumpId(pump.getId()).tankId(tank.getId()).fuelType(FuelType.PETROL)
                .quantityDelivered(new BigDecimal(litres)).costPricePerUnit(new BigDecimal("90.00"))
                .deliveryDate(at(deliveryDay, "00:00")).invoiceReference("INV-" + shortId())
                .loggedByUserId(owner.getId()).build());
        inventoryLotRepository.save(InventoryLot.builder()
                .tankerDeliveryId(delivery.getId()).tankId(tank.getId()).fuelType(FuelType.PETROL)
                .pumpId(pump.getId()).originalQuantity(new BigDecimal(litres))
                .remainingQuantity(new BigDecimal(litres)).costPricePerUnit(new BigDecimal("90.00"))
                .deliveryDate(at(deliveryDay, "00:00")).isDipAdjustment(false).status(LotStatus.ACTIVE)
                .build());
        tank.setCurrentStock(tank.getCurrentStock().add(new BigDecimal(litres)));
        tankRepository.save(tank);
        return delivery;
    }

    private FuelDipEntry saveDipEntry(String loss, LocalDate dipDate) {
        return fuelDipEntryRepository.save(FuelDipEntry.builder()
                .pumpId(pump.getId()).fuelType(FuelType.PETROL.name())
                .litresRemoved(new BigDecimal(loss).divide(new BigDecimal("100.00")))
                .pricePerUnit(new BigDecimal("100.00")).monetaryLoss(new BigDecimal(loss))
                .reason("Calibration test").dipDate(dipDate).recordedByUserId(owner.getId()).build());
    }

    private OffsetDateTime at(LocalDate date, String time) {
        return date.atTime(LocalTime.parse(time)).atZone(IST).toOffsetDateTime();
    }

    private User saveUser(UserRole role, Long assignedPumpId) {
        String unique = shortId();
        return userRepository.save(User.builder()
                .employeeId("EMP-" + unique)
                .fullName(role + " " + unique)
                .phoneNumber(Long.toString(6_000_000_000L + (long) (Math.random() * 3_999_999_999L)))
                .passwordHash("not-used")
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPumpId(assignedPumpId)
                .dateOfJoining(TestDates.today())
                .build());
    }

    private String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
