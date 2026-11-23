package com.ppms.common;

import com.ppms.support.TestDates;
import com.ppms.ancillary.AncillaryInventoryWorkflowService;
import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductPrice;
import com.ppms.ancillary.AncillaryProductPriceRepository;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillaryProductStatus;
import com.ppms.ancillary.AncillaryStockLotRepository;
import com.ppms.ancillary.RecordAncillarySaleRequest;
import com.ppms.ancillary.RecordStockDeliveryRequest;
import com.ppms.ancillary.UnitOfMeasure;
import com.ppms.common.exception.BusinessException;
import com.ppms.expense.CreateExpenseRequest;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.expense.ExpenseCategory;
import com.ppms.expense.ExpenseController;
import com.ppms.expense.PumpExpense;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.fuel.FuelType;
import com.ppms.inventory.InventoryWorkflowService;
import com.ppms.inventory.InventoryLot;
import com.ppms.inventory.InventoryLotRepository;
import com.ppms.inventory.LotConsumptionRepository;
import com.ppms.inventory.LotStatus;
import com.ppms.inventory.RecordDeliveryRequest;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.Nozzle;
import com.ppms.pump.NozzleRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.pump.TankStatus;
import com.ppms.pump.UndergroundTank;
import com.ppms.pump.UndergroundTankRepository;
import com.ppms.scheduler.OverdueShiftProcessor;
import com.ppms.shift.CloseShiftRequest;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftFuelReading;
import com.ppms.shift.ShiftFuelReadingRepository;
import com.ppms.shift.ShiftNozzle;
import com.ppms.shift.ShiftNozzleRepository;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftService;
import com.ppms.shift.ShiftStatus;
import com.ppms.support.PostgresTestContainerConfig;
import com.ppms.transaction.TransactionPaymentMode;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class ConcurrentUpdateIntegrationTest {

    @Autowired private ShiftService shiftService;
    @Autowired private InventoryWorkflowService inventoryWorkflowService;
    @Autowired private AncillaryInventoryWorkflowService ancillaryWorkflowService;
    @Autowired private OverdueShiftProcessor overdueShiftProcessor;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private DispensaryUnitRepository duRepository;
    @Autowired private NozzleRepository nozzleRepository;
    @Autowired private UndergroundTankRepository tankRepository;
    @Autowired private InventoryLotRepository inventoryLotRepository;
    @Autowired private LotConsumptionRepository lotConsumptionRepository;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private ShiftNozzleRepository shiftNozzleRepository;
    @Autowired private ShiftFuelReadingRepository fuelReadingRepository;
    @Autowired private AncillaryProductRepository ancillaryProductRepository;
    @Autowired private AncillaryStockLotRepository ancillaryLotRepository;
    @Autowired private AncillaryProductPriceRepository ancillaryPriceRepository;
    @Autowired private ExpenseController expenseController;
    @Autowired private PumpExpenseRepository expenseRepository;

    private User owner;
    private User manager;
    private User operator;
    private PumpLocation pump;
    private UndergroundTank tank;
    private InventoryLot lot;
    private Nozzle nozzle;
    private DispensaryUnit du;

    @BeforeEach
    void createPumpWithStockedTank() {
        owner = saveUser(UserRole.OWNER, null);
        pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(4)
                .build());
        manager = saveUser(UserRole.MANAGER, pump.getId());
        operator = saveUser(UserRole.OPERATOR, pump.getId());
        tank = tankRepository.save(UndergroundTank.builder()
                .pumpId(pump.getId())
                .tankIdentifier("T-" + shortId())
                .fuelType(FuelType.PETROL)
                .capacity(new BigDecimal("20000"))
                .currentStock(new BigDecimal("5000.000"))
                .dipTolerance(new BigDecimal("50"))
                .status(TankStatus.ACTIVE)
                .build());
        lot = inventoryLotRepository.save(InventoryLot.builder()
                .tankId(tank.getId())
                .fuelType(FuelType.PETROL)
                .pumpId(pump.getId())
                .originalQuantity(new BigDecimal("5000.000"))
                .remainingQuantity(new BigDecimal("5000.000"))
                .costPricePerUnit(new BigDecimal("90.00"))
                .deliveryDate(TestDates.now().minusDays(1))
                .isDipAdjustment(false)
                .status(LotStatus.ACTIVE)
                .build());
        du = duRepository.save(DispensaryUnit.builder()
                .pumpId(pump.getId())
                .duNumber(1)
                .name("DU-" + shortId())
                .build());
        nozzle = nozzleRepository.save(Nozzle.builder()
                .duId(du.getId())
                .nozzleNumber(1)
                .fuelType(FuelType.PETROL)
                .lastReading(new BigDecimal("1000.000"))
                .tankId(tank.getId())
                .build());
    }

    @Test
    void secondCloseWaitsForTheFirstAndThenFindsTheShiftClosed() throws Exception {
        Shift shift = saveOpenShift(ShiftStatus.OPEN);
        CloseShiftRequest request = closeRequestSelling("10.000");

        CompetitorResult<?> second = runWhileRowIsLocked(
                () -> shiftRepository.findByIdForUpdate(shift.getId()).orElseThrow(),
                () -> shiftService.closeShift(pump.getId(), shift.getId(), request, manager),
                () -> shiftService.closeShift(pump.getId(), shift.getId(), request, manager));

        assertThat(second.failure()).isInstanceOf(BusinessException.class).hasMessageContaining("Shift is not open");
        assertThat(tankRepository.findById(tank.getId()).orElseThrow().getCurrentStock()).isEqualByComparingTo("4990.000");
        assertThat(inventoryLotRepository.findById(lot.getId()).orElseThrow().getRemainingQuantity()).isEqualByComparingTo("4990.000");
        assertThat(lotConsumptionRepository.findByShiftId(shift.getId())).hasSize(1);
    }

    @Test
    void deliveryWaitsForShiftCloseAndIsKeptInTankStock() throws Exception {
        Shift shift = saveOpenShift(ShiftStatus.OPEN);
        RecordDeliveryRequest delivery = new RecordDeliveryRequest();
        delivery.setTankId(tank.getId());
        delivery.setQuantityDelivered(new BigDecimal("1000"));
        delivery.setCostPricePerUnit(new BigDecimal("91.00"));
        delivery.setDeliveryDate(TestDates.today());
        delivery.setInvoiceReference("INV-" + shortId());

        CompetitorResult<?> deliveryResult = runWhileRowIsLocked(
                () -> tankRepository.findByIdForUpdate(tank.getId()).orElseThrow(),
                () -> shiftService.closeShift(pump.getId(), shift.getId(), closeRequestSelling("10.000"), manager),
                () -> inventoryWorkflowService.recordDelivery(pump.getId(), delivery, owner));

        assertThat(deliveryResult.failure()).isNull();
        assertThat(tankRepository.findById(tank.getId()).orElseThrow().getCurrentStock()).isEqualByComparingTo("5990.000");
    }

    @Test
    void secondSaleWaitsForTheFirstAndIsRefusedWhenStockRunsOut() throws Exception {
        AncillaryProduct product = ancillaryProductRepository.save(AncillaryProduct.builder()
                .pumpId(pump.getId())
                .name("Engine oil " + shortId())
                .packageSize(new BigDecimal("1.000"))
                .unitOfMeasure(UnitOfMeasure.LITRE)
                .currentStockUnits(0)
                .gstRatePercent(new BigDecimal("18.00"))
                .status(AncillaryProductStatus.ACTIVE)
                .build());
        RecordStockDeliveryRequest stock = new RecordStockDeliveryRequest();
        stock.setQuantityUnits(10);
        stock.setCostPricePerUnit(new BigDecimal("300.00"));
        stock.setDeliveryDate(TestDates.today());
        ancillaryWorkflowService.recordDelivery(pump.getId(), product.getId(), stock, manager);
        ancillaryPriceRepository.save(AncillaryProductPrice.builder()
                .productId(product.getId())
                .pumpId(pump.getId())
                .pricePerUnit(new BigDecimal("400.00"))
                .effectiveFrom(TestDates.now().minusDays(1))
                .setByUserId(manager.getId())
                .build());

        RecordAncillarySaleRequest sale = new RecordAncillarySaleRequest();
        sale.setProductId(product.getId());
        sale.setQuantityUnits(6);
        sale.setSellingPricePerUnit(new BigDecimal("400.00"));
        sale.setPaymentMode(TransactionPaymentMode.UPI);

        CompetitorResult<?> second = runWhileRowIsLocked(
                () -> ancillaryProductRepository.findByIdAndPumpIdForUpdate(product.getId(), pump.getId()).orElseThrow(),
                () -> ancillaryWorkflowService.recordSale(pump.getId(), sale, manager),
                () -> ancillaryWorkflowService.recordSale(pump.getId(), sale, manager));

        assertThat(second.failure()).isInstanceOf(BusinessException.class).hasMessageContaining("Insufficient stock");
        assertThat(ancillaryProductRepository.findById(product.getId()).orElseThrow().getCurrentStockUnits()).isEqualTo(4);
        assertThat(ancillaryLotRepository.findAllActiveLotsByProductIds(List.of(product.getId())))
                .singleElement()
                .satisfies(remainingLot -> assertThat(remainingLot.getRemainingQuantity()).isEqualTo(4));
    }

    @Test
    void overdueJobWaitsForAManualCloseAndLeavesItUnchanged() throws Exception {
        Shift shift = saveOpenShift(ShiftStatus.OPEN_OVERDUE);

        CompetitorResult<OverdueShiftProcessor.Outcome> job = runWhileRowIsLocked(
                () -> shiftRepository.findByIdForUpdate(shift.getId()).orElseThrow(),
                () -> {
                    Shift locked = shiftRepository.findByIdForUpdate(shift.getId()).orElseThrow();
                    locked.setStatus(ShiftStatus.CLOSED_BALANCED);
                    locked.setCashCollected(new BigDecimal("1000.00"));
                    shiftRepository.save(locked);
                },
                () -> overdueShiftProcessor.process(shift.getId(), TestDates.now()));

        assertThat(job.failure()).isNull();
        assertThat(job.value()).isEqualTo(OverdueShiftProcessor.Outcome.UNCHANGED);
        Shift reloaded = shiftRepository.findById(shift.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ShiftStatus.CLOSED_BALANCED);
        assertThat(reloaded.getCashCollected()).isEqualByComparingTo("1000.00");
    }

    @Test
    void secondExpenseOfTheDayWaitsForTheFirstAndIsHeldWhenTheTotalPassesTheThreshold() throws Exception {
        pump.setExpenseApprovalThreshold(new BigDecimal("1000.00"));
        pumpLocationRepository.save(pump);
        CreateExpenseRequest expense = new CreateExpenseRequest();
        expense.setCategory(ExpenseCategory.MAINTENANCE);
        expense.setAmount(new BigDecimal("600.00"));
        expense.setDescription("Nozzle repair");
        expense.setExpenseDate(TestDates.today());

        CompetitorResult<PumpExpense> second = runWhileRowIsLocked(
                () -> pumpLocationRepository.findByIdForUpdate(pump.getId()).orElseThrow(),
                () -> actingAs(manager, () -> expenseController.createExpense(pump.getId(), expense, manager)),
                () -> actingAs(manager, () -> expenseController.createExpense(pump.getId(), expense, manager)));

        assertThat(second.failure()).isNull();
        assertThat(second.value().getApprovalStatus()).isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
        assertThat(expenseRepository.countByPumpIdAndApprovalStatus(pump.getId(), ExpenseApprovalStatus.APPROVED)).isEqualTo(1);
    }

    private <T> T actingAs(User user, Supplier<T> action) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        try {
            return action.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private Shift saveOpenShift(ShiftStatus status) {
        Shift shift = shiftRepository.save(Shift.builder()
                .pumpId(pump.getId())
                .duId(du.getId())
                .operatorId(operator.getId())
                .openedByUserId(manager.getId())
                .shiftDate(TestDates.today())
                .actualStartTime(TestDates.now().minusHours(2))
                .status(status)
                .isOverdueFlag(status == ShiftStatus.OPEN_OVERDUE)
                .build());
        shiftNozzleRepository.save(ShiftNozzle.builder().shiftId(shift.getId()).nozzleId(nozzle.getId()).build());
        fuelReadingRepository.save(ShiftFuelReading.builder()
                .shiftId(shift.getId())
                .nozzleId(nozzle.getId())
                .fuelType(FuelType.PETROL)
                .tankId(tank.getId())
                .startReading(new BigDecimal("1000.000"))
                .priceSnapshot(new BigDecimal("100.00"))
                .build());
        return shift;
    }

    private CloseShiftRequest closeRequestSelling(String litres) {
        BigDecimal sold = new BigDecimal(litres);
        CloseShiftRequest request = new CloseShiftRequest();
        request.setFuelReadings(List.of(new CloseShiftRequest.OutletEndReadingRequest(
                nozzle.getId(), new BigDecimal("1000.000").add(sold))));
        request.setCashCollected(sold.multiply(new BigDecimal("100.00")).setScale(2));
        request.setUpiCollected(BigDecimal.ZERO);
        request.setCardCollected(BigDecimal.ZERO);
        request.setFleetCardCollected(BigDecimal.ZERO);
        request.setCreditTotal(BigDecimal.ZERO);
        return request;
    }

    private record CompetitorResult<T>(T value, Throwable failure) {}

    /**
     * Holds a row lock in one transaction, starts the competitor, proves the competitor is waiting
     * on that lock, then lets the holder's write commit and returns how the competitor ended.
     * Without the production lock the competitor would never wait and the test fails.
     */
    private <T> CompetitorResult<T> runWhileRowIsLocked(Runnable lockRow, Runnable firstWrite, Callable<T> competitor)
            throws Exception {
        CountDownLatch rowLocked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = executor.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                lockRow.run();
                rowLocked.countDown();
                awaitOrFail(release);
                firstWrite.run();
            }));
            assertThat(rowLocked.await(10, TimeUnit.SECONDS)).as("holder took the row lock").isTrue();

            Future<T> competing = executor.submit(competitor);
            assertThat(waitUntilASessionIsBlockedOnALock()).as("competitor waits on the row lock").isTrue();
            assertThat(competing.isDone()).isFalse();

            release.countDown();
            holder.get(30, TimeUnit.SECONDS);
            try {
                return new CompetitorResult<>(competing.get(30, TimeUnit.SECONDS), null);
            } catch (ExecutionException e) {
                return new CompetitorResult<>(null, e.getCause());
            }
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    private boolean waitUntilASessionIsBlockedOnALock() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM pg_stat_activity
                    WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'
                    """, Integer.class);
            if (blocked != null && blocked > 0) {
                return true;
            }
            TimeUnit.MILLISECONDS.sleep(20);
        }
        return false;
    }

    private void awaitOrFail(CountDownLatch latch) {
        try {
            if (!latch.await(20, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Test never released the row lock");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while holding the row lock", e);
        }
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
