package com.ppms.common;

import com.ppms.support.TestDates;
import com.ppms.ancillary.AncillaryInventoryWorkflowService;
import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductPrice;
import com.ppms.ancillary.AncillaryProductPriceRepository;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillarySale;
import com.ppms.ancillary.AncillarySaleRepository;
import com.ppms.ancillary.AncillaryProductStatus;
import com.ppms.ancillary.RecordAncillarySaleRequest;
import com.ppms.ancillary.RecordStockDeliveryRequest;
import com.ppms.ancillary.UnitOfMeasure;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.text.ServerTextCodes;
import com.ppms.fuel.FuelType;
import com.ppms.credit.ReassignCreditEntryRequest;
import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientRepository;
import com.ppms.credit.CreditInterestCharge;
import com.ppms.credit.CreditInterestChargeRepository;
import com.ppms.credit.CreditInterestRunService;
import com.ppms.credit.CreditInterestService;
import com.ppms.credit.CreditLedgerQueryService;
import com.ppms.credit.CreditLedgerService;
import com.ppms.credit.CreditPayment;
import com.ppms.credit.RecordPaymentRequest;
import com.ppms.credit.CreditPaymentRepository;
import com.ppms.credit.CreditTransactionResponse;
import com.ppms.credit.PaymentMode;
import com.ppms.expense.ExpenseApprovalStatus;
import com.ppms.payroll.GeneratePayrollRequest;
import com.ppms.payroll.PayrollRecord;
import com.ppms.payroll.PayrollRepository;
import com.ppms.payroll.PayrollService;
import com.ppms.pump.DispensaryUnit;
import com.ppms.pump.DispensaryUnitRepository;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.settlement.PaymentSettlementService;
import com.ppms.settlement.VoidSettlementRequest;
import com.ppms.settlement.SettlementResponse;
import com.ppms.settlement.RecordSettlementRequest;
import com.ppms.settlement.SettlementPaymentType;
import com.ppms.shift.DiscrepancyResolution;
import com.ppms.shift.DiscrepancyType;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.shift.ShiftCreditEntryRepository;
import com.ppms.shift.ShiftRepository;
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
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresTestContainerConfig.class)
class MoneyCorrectnessIntegrationTest {

    @Autowired private CreditLedgerQueryService ledgerQueryService;
    @Autowired private CreditLedgerService ledgerService;
    @Autowired private CreditInterestService interestService;
    @Autowired private CreditInterestRunService interestRunService;
    @Autowired private PayrollService payrollService;
    @Autowired private PaymentSettlementService settlementService;
    @Autowired private AncillaryInventoryWorkflowService ancillaryWorkflowService;
    @Autowired private UserRepository userRepository;
    @Autowired private PumpLocationRepository pumpLocationRepository;
    @Autowired private DispensaryUnitRepository duRepository;
    @Autowired private ShiftRepository shiftRepository;
    @Autowired private ShiftCreditEntryRepository creditEntryRepository;
    @Autowired private CreditClientRepository clientRepository;
    @Autowired private CreditPaymentRepository paymentRepository;
    @Autowired private CreditInterestChargeRepository interestChargeRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PayrollRepository payrollRepository;
    @Autowired private AncillaryProductRepository ancillaryProductRepository;
    @Autowired private AncillaryProductPriceRepository ancillaryPriceRepository;
    @Autowired private AncillarySaleRepository ancillarySaleRepository;

    private User owner;
    private User manager;
    private User operator;
    private PumpLocation pump;
    private DispensaryUnit du;

    @BeforeEach
    void createPump() {
        owner = saveUser(UserRole.OWNER, null);
        pump = pumpLocationRepository.save(PumpLocation.builder()
                .ownerId(owner.getId())
                .name("Pump " + shortId())
                .address("Test address")
                .maxDuCount(4)
                .build());
        manager = saveUser(UserRole.MANAGER, pump.getId());
        operator = saveUser(UserRole.OPERATOR, pump.getId());
        operator.setShift1HourlyRate(new BigDecimal("100.00"));
        operator.setStandardHourlyRate(new BigDecimal("80.00"));
        operator = userRepository.save(operator);
        du = duRepository.save(DispensaryUnit.builder()
                .pumpId(pump.getId())
                .duNumber(1)
                .name("DU-" + shortId())
                .build());
    }

    @Test
    void ledgerRunningBalanceIgnoresVoidedSalesAndUnapprovedPayments() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        Shift shift = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        saveCreditSale(shift, client, "1000.00", "ACTIVE");
        saveCreditSale(shift, client, "5000.00", "VOIDED");
        savePayment(client, "300.00", ExpenseApprovalStatus.APPROVED, owner);
        savePayment(client, "2000.00", ExpenseApprovalStatus.REJECTED, manager);
        savePayment(client, "100.00", ExpenseApprovalStatus.PENDING_APPROVAL, manager);

        List<CreditTransactionResponse> statement = ledgerQueryService.getStatement(client, null, null).transactions();

        assertThat(statement).hasSize(5);
        assertThat(statement.get(statement.size() - 1).getRunningBalance())
                .isEqualByComparingTo(interestService.computeOutstanding(client.getId()))
                .isEqualByComparingTo("700.00");
        assertThat(statement).filteredOn(tx -> !tx.isCountedInBalance())
                .extracting(CreditTransactionResponse::getStatus)
                .containsExactlyInAnyOrder("VOIDED", "REJECTED", "PENDING_APPROVAL");
    }

    @Test
    void payrollThatFailsAfterResolvingDiscrepanciesLeavesThemPending() {
        operator.setShift1HourlyRate(null);
        userRepository.save(operator);
        Shift discrepancy = saveClosedShift(TestDates.today().minusDays(2), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "50.00");

        assertThatThrownBy(() -> payrollService.generate(pump.getId(), payrollRequest(discrepancy), owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("hourly rates");

        Shift reloaded = shiftRepository.findById(discrepancy.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
        assertThat(reloaded.getDiscrepancyResolution()).isNull();
    }

    @Test
    void secondPayrollForTheSamePeriodIsRefusedWithoutResolvingMoreDiscrepancies() {
        payrollService.generate(pump.getId(), payrollRequest(null), owner);
        Shift discrepancy = saveClosedShift(TestDates.today().minusDays(2), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "50.00");

        assertThatThrownBy(() -> payrollService.generate(pump.getId(), payrollRequest(discrepancy), owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already covers");

        assertThat(shiftRepository.findById(discrepancy.getId()).orElseThrow().getStatus())
                .isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
    }

    @Test
    void payrollPeriodThatOverlapsAnEarlierOneIsRefused() {
        payrollService.generate(pump.getId(), payrollRequest(null), owner);

        GeneratePayrollRequest overlapping = payrollRequest(null);
        overlapping.setPeriodFrom(TestDates.today().minusDays(2));
        overlapping.setPeriodTo(TestDates.today().plusDays(5));

        assertThatThrownBy(() -> payrollService.generate(pump.getId(), overlapping, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("overlaps");
    }

    @Test
    void discrepancyDeductedByOnePayrollIsNotDeductedAgainByAnother() {
        Shift lastMonth = saveClosedShift(TestDates.today().minusDays(20), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "500.00");
        PayrollRecord current = payrollService.generate(pump.getId(), payrollRequest(lastMonth), owner);
        assertThat(current.getDeductions()).isEqualByComparingTo("500.00");

        GeneratePayrollRequest earlier = payrollRequest(null);
        earlier.setPeriodFrom(TestDates.today().minusDays(30));
        earlier.setPeriodTo(TestDates.today().minusDays(8));
        PayrollRecord earlierPayroll = payrollService.generate(pump.getId(), earlier, owner);

        assertThat(earlierPayroll.getDeductions()).isEqualByComparingTo("0.00");
    }

    @Test
    void overDiscrepancyCannotBeDeductedFromSalaryByPayroll() {
        Shift over = saveOverDiscrepancy(ShiftStatus.CLOSED_DISCREPANCY_PENDING, null);

        assertThatThrownBy(() -> payrollService.generate(pump.getId(), payrollRequest(over), owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("only SHORT discrepancies");

        Shift reloaded = shiftRepository.findById(over.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
        assertThat(reloaded.getDiscrepancyResolution()).isNull();
        assertThat(payrollRepository.findAll()).noneMatch(record -> record.getPumpId().equals(pump.getId()));
    }

    @Test
    void overDiscrepancyAlreadyMarkedAsSalaryDeductionIsLeftOutOfPayrollDeductions() {
        saveOverDiscrepancy(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED, DiscrepancyResolution.SALARY_DEDUCTION);
        Shift shortShift = saveClosedShift(TestDates.today().minusDays(2), ShiftStatus.CLOSED_DISCREPANCY_RESOLVED, "40.00");
        shortShift.setDiscrepancyResolution(DiscrepancyResolution.SALARY_DEDUCTION);
        shiftRepository.save(shortShift);

        PayrollRecord payroll = payrollService.generate(pump.getId(), payrollRequest(null), owner);

        assertThat(payroll.getDeductions()).isEqualByComparingTo("40.00");
    }

    @Test
    void pendingDiscrepanciesOfferedForSalaryDeductionAreOnlyShortOnes() {
        Shift shortShift = saveClosedShift(TestDates.today().minusDays(2), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "50.00");
        saveOverDiscrepancy(ShiftStatus.CLOSED_DISCREPANCY_PENDING, null);

        assertThat(shiftRepository.findPendingDiscrepanciesByPumpAndOperator(pump.getId(), operator.getId()))
                .extracting(Shift::getId)
                .containsExactly(shortShift.getId());
    }

    @Test
    void subAccountPaymentCannotTakeTheGroupBelowZero() {
        CreditClient parent = saveClient(BigDecimal.ZERO);
        CreditClient child = clientRepository.save(CreditClient.builder()
                .pumpId(pump.getId())
                .name("Child " + shortId())
                .parentClientId(parent.getId())
                .monthlyInterestRate(BigDecimal.ZERO)
                .build());
        Shift shift = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        saveCreditSale(shift, child, "1000.00", "ACTIVE");
        savePayment(parent, "1000.00", ExpenseApprovalStatus.APPROVED, owner);

        RecordPaymentRequest request = new RecordPaymentRequest();
        request.setAmount(new BigDecimal("1000.00"));
        request.setPaymentMode(PaymentMode.CASH);
        request.setPaidAt(TestDates.today());

        assertThatThrownBy(() -> ledgerService.recordPayment(pump.getId(), child.getId(), request, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("exceeds the amount still payable");
    }

    @Test
    void deletingPayrollDraftRestoresTheDiscrepanciesItResolved() {
        Shift discrepancy = saveClosedShift(TestDates.today().minusDays(2), ShiftStatus.CLOSED_DISCREPANCY_PENDING, "50.00");
        PayrollRecord draft = payrollService.generate(pump.getId(), payrollRequest(discrepancy), owner);
        assertThat(draft.getDeductions()).isEqualByComparingTo("50.00");
        assertThat(shiftRepository.findById(discrepancy.getId()).orElseThrow().getStatus())
                .isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_RESOLVED);

        payrollService.deleteDraft(pump.getId(), draft.getId(), owner);

        Shift restored = shiftRepository.findById(discrepancy.getId()).orElseThrow();
        assertThat(restored.getStatus()).isEqualTo(ShiftStatus.CLOSED_DISCREPANCY_PENDING);
        assertThat(restored.getDiscrepancyResolution()).isNull();
        assertThat(payrollRepository.findById(draft.getId())).isEmpty();
    }

    @Test
    void payrollPaysWorkedMinutesAtTheHourlyRateRoundedOnce() {
        Shift shift = saveClosedShift(TestDates.today().minusDays(1), ShiftStatus.CLOSED_BALANCED, null);
        shift.setActualStartTime(TestDates.now().minusDays(1).withHour(8).withMinute(0));
        shift.setActualEndTime(shift.getActualStartTime().plusMinutes(100));
        shiftRepository.save(shift);

        PayrollRecord draft = payrollService.generate(pump.getId(), payrollRequest(null), owner);

        // 100 min × ₹80/h = ₹133.333… → ₹133.33 (rounding hours first would give 1.67 h × 80 = ₹133.60)
        assertThat(draft.getGrossAmount()).isEqualByComparingTo("133.33");
    }

    @Test
    void interestRunKeepsOtherClientsWhenOneGroupFails() {
        CreditClient healthyRoot = saveClient(new BigDecimal("2.00"));
        seedOutstandingInterest(healthyRoot, "1000.00", 40);
        saveCreditSaleOn(healthyRoot, "1000.00", TestDates.today().minusDays(39));

        CreditClient failingRoot = saveClient(new BigDecimal("999.99"));
        seedOutstandingInterest(failingRoot, "1000.00", 40);
        CreditClient child = saveClient(BigDecimal.ZERO);
        child.setParentClientId(failingRoot.getId());
        clientRepository.save(child);
        saveCreditSaleOn(child, "900000000000.00", TestDates.today().minusDays(39));

        CreditInterestRunService.InterestRunResult result =
                interestRunService.applyProRataForAllClients(pump.getId(), owner.getId());

        assertThat(result.groupsCharged()).isEqualTo(1);
        assertThat(result.failedClientIds()).containsExactly(failingRoot.getId());
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(healthyRoot.getId())).hasSize(2);
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(failingRoot.getId())).hasSize(1);
    }

    @Test
    void nobodyCanApproveAPaymentTheyRecordedThemselves() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        Shift shift = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        saveCreditSale(shift, client, "1000.00", "ACTIVE");
        CreditPayment payment = savePayment(client, "500.00", ExpenseApprovalStatus.PENDING_APPROVAL, owner);

        assertThatThrownBy(() -> ledgerService.approvePayment(pump.getId(), payment.getId(), ExpenseApprovalStatus.APPROVED, owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("another Owner or Admin");
        assertThat(paymentRepository.findById(payment.getId()).orElseThrow().getPaymentApprovalStatus())
                .isEqualTo(ExpenseApprovalStatus.PENDING_APPROVAL);
    }

    @Test
    void voidedSettlementNoLongerReducesTheWalletAndDuplicatesAreRefused() {
        Shift collected = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        collected.setUpiCollected(new BigDecimal("79000.00"));
        shiftRepository.save(collected);
        RecordSettlementRequest request = RecordSettlementRequest.builder()
                .paymentType(SettlementPaymentType.UPI)
                .settlementDate(TestDates.today())
                .amountReceived(new BigDecimal("79000.00"))
                .build();
        SettlementResponse recorded = settlementService.record(pump.getId(), request, manager);
        assertThat(settlementService.getWalletSummary(pump.getId()).getUpiPending()).isEqualByComparingTo("0.00");

        assertThatThrownBy(() -> settlementService.record(pump.getId(), request, manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("last 2 minutes");

        SettlementResponse voided = settlementService.voidSettlement(pump.getId(), recorded.getId(),
                VoidSettlementRequest.builder().reason("Typed 79000 instead of 7900").build(), owner);

        assertThat(voided.getVoidStatus()).isEqualTo("VOIDED");
        assertThat(settlementService.getWalletSummary(pump.getId()).getUpiPending()).isEqualByComparingTo("79000.00");
    }

    @Test
    void counterSaleOnCreditToASubAccountOfADisabledParentIsRefused() {
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");
        CreditClient parent = saveClient(BigDecimal.ZERO);
        CreditClient subAccount = saveSubAccount(parent);
        parent.setActive(false);
        clientRepository.save(parent);

        assertThatThrownBy(() -> ancillaryWorkflowService.recordSale(pump.getId(), creditSale(product, subAccount, 1), manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("parent account");
    }

    @Test
    void linkingAnUnlinkedCreditEntryForTheFirstTimeChecksTheClientsLimit() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        client.setCreditLimit(new BigDecimal("500.00"));
        clientRepository.save(client);
        saveCreditSaleOn(client, "400.00", TestDates.today());
        Shift shift = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        ShiftCreditEntry tooLarge = saveUnlinkedCreditEntry(shift, "150.00");
        ShiftCreditEntry fits = saveUnlinkedCreditEntry(shift, "100.00");

        assertThatThrownBy(() -> ledgerService.reassignCreditEntry(pump.getId(), tooLarge.getId(), reassignTo(client), manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Credit limit exceeded");
        ledgerService.reassignCreditEntry(pump.getId(), fits.getId(), reassignTo(client), manager);

        assertThat(creditEntryRepository.findById(tooLarge.getId()).orElseThrow().getClientId()).isNull();
        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("500.00");
    }

    @Test
    void managerCannotSellBelowTheConfiguredPriceButOwnerCan() {
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");

        RecordAncillarySaleRequest cheapSale = new RecordAncillarySaleRequest();
        cheapSale.setProductId(product.getId());
        cheapSale.setQuantityUnits(1);
        cheapSale.setSellingPricePerUnit(new BigDecimal("0.01"));
        cheapSale.setPaymentMode(TransactionPaymentMode.UPI);

        assertThatThrownBy(() -> ancillaryWorkflowService.recordSale(pump.getId(), cheapSale, manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Only an Owner or Admin");
        assertThat(ancillaryWorkflowService.recordSale(pump.getId(), cheapSale, owner).getSale().getSellingPricePerUnit())
                .isEqualByComparingTo("0.01");
    }

    @Test
    void creditCounterSaleRaisesTheClientsBalanceAndStoresTheProductsGstRate() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");

        AncillarySale sale = ancillaryWorkflowService.recordSale(pump.getId(), creditSale(product, client, 2), manager).getSale();

        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("800.00");
        assertThat(sale.getGstRatePercent()).isEqualByComparingTo("18.00");
        assertThat(sale.getClientName()).isEqualTo(client.getName());
    }

    @Test
    void creditCounterSaleBeyondTheGroupLimitIsRefusedAndTakesNoStock() {
        CreditClient parent = saveClient(BigDecimal.ZERO);
        parent.setCreditLimit(new BigDecimal("1000.00"));
        clientRepository.save(parent);
        CreditClient child = saveSubAccount(parent);
        saveCreditSaleOn(child, "500.00", TestDates.today());
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");

        assertThatThrownBy(() -> ancillaryWorkflowService.recordSale(pump.getId(), creditSale(product, child, 2), manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Credit limit exceeded");

        assertThat(ancillaryProductRepository.findById(product.getId()).orElseThrow().getCurrentStockUnits()).isEqualTo(10);
        assertThat(interestService.computeOutstandingWithChildren(parent.getId())).isEqualByComparingTo("500.00");
    }

    @Test
    void creditCounterSaleWithoutAClientIsRefused() {
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");
        RecordAncillarySaleRequest request = creditSale(product, saveClient(BigDecimal.ZERO), 1);
        request.setClientId(null);
        request.setClientName("Walk-in");

        assertThatThrownBy(() -> ancillaryWorkflowService.recordSale(pump.getId(), request, manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Choose a credit client");
    }

    @Test
    void creditCounterSaleIsAddedToTheLedgerWithProductQuantityAndBillNumber() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        AncillaryProduct product = saveProductWithStockAndPrice("400.00");
        RecordAncillarySaleRequest request = creditSale(product, client, 2);
        request.setBillNo("B-42");
        ancillaryWorkflowService.recordSale(pump.getId(), request, manager);
        Shift shift = saveClosedShift(TestDates.today(), ShiftStatus.CLOSED_BALANCED, null);
        saveCreditSale(shift, client, "100.00", "ACTIVE");

        List<CreditTransactionResponse> rows = ledgerQueryService.getAllTransactions(client, false);

        assertThat(rows).anySatisfy(row -> {
            assertThat(row.getType()).isEqualTo("COUNTER_SALE");
            assertThat(row.getReference()).contains(product.getName()).contains("× 2").contains("Bill B-42");
            assertThat(row.getReferenceCode()).isEqualTo(ServerTextCodes.COUNTER_SALE_DETAILS_WITH_BILL);
            assertThat(row.getReferenceParams()).containsEntry("quantity", 2).containsEntry("billNo", "B-42");
            assertThat(row.getAmount()).isEqualByComparingTo("800.00");
        });
        assertThat(rows.get(0).getRunningBalance()).isEqualByComparingTo("900.00");
    }

    @Test
    void parentIsChargedInterestOnTheWholeGroupBalanceAndSubAccountsAreNotCharged() {
        CreditClient parent = saveClient(new BigDecimal("3.00"));
        CreditClient child = saveSubAccount(parent);
        seedChargeEndingOn(parent, "0.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(parent, "10000.00", LocalDate.of(2025, 11, 1));
        saveCreditSaleOn(child, "15000.00", LocalDate.of(2025, 11, 1));
        saveCounterSaleOn(child, "5000.00", LocalDate.of(2025, 11, 1));

        interestService.applyToClientGroupInNewTransaction(parent.getId(), LocalDate.of(2025, 11, 30), "SCHEDULED", null);

        // ₹30,000 combined (fuel and counter sales) × 3% / 30 per day × 30 days of November
        CreditInterestCharge charge = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(parent.getId()).get(0);
        assertThat(charge.getAmount()).isEqualByComparingTo("900.00");
        assertThat(charge.getOutstandingBalance()).isEqualByComparingTo("30000.00");
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(child.getId())).isEmpty();
    }

    @Test
    void groupInterestIsZeroOnceTheParentHasPaidTheWholeGroupBalance() {
        CreditClient parent = saveClient(new BigDecimal("3.00"));
        CreditClient child = saveSubAccount(parent);
        seedChargeEndingOn(parent, "0.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(child, "30000.00", LocalDate.of(2025, 11, 1));
        CreditPayment payment = savePayment(parent, "30000.00", ExpenseApprovalStatus.APPROVED, owner);
        payment.setPaidAt(LocalDate.of(2025, 11, 1));
        paymentRepository.save(payment);

        int charges = interestService.applyToClientGroupInNewTransaction(
                parent.getId(), LocalDate.of(2025, 11, 30), "SCHEDULED", null);

        assertThat(charges).isZero();
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(parent.getId())).hasSize(1);
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(child.getId())).isEmpty();
    }

    @Test
    void groupInterestStartsAfterTheLastDayAlreadyChargedToASubAccount() {
        CreditClient parent = saveClient(new BigDecimal("3.00"));
        CreditClient child = saveSubAccount(parent);
        seedChargeEndingOn(child, "50.00", LocalDate.of(2025, 11, 15));
        saveCreditSaleOn(child, "30000.00", LocalDate.of(2025, 11, 1));

        interestService.applyToClientGroupInNewTransaction(parent.getId(), LocalDate.of(2025, 11, 30), "SCHEDULED", null);

        CreditInterestCharge charge = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(parent.getId()).get(0);
        assertThat(charge.getPeriodFrom()).isEqualTo(LocalDate.of(2025, 11, 16));
        // ₹30,000 × 0.1% per day × 15 days
        assertThat(charge.getAmount()).isEqualByComparingTo("450.00");
    }

    @Test
    void subAccountCannotBeChargedInterestOnItsOwn() {
        CreditClient parent = saveClient(new BigDecimal("3.00"));
        CreditClient child = saveSubAccount(parent);
        saveCreditSaleOn(child, "30000.00", TestDates.today().minusDays(40));

        assertThatThrownBy(() -> interestService.applyProRata(pump.getId(), child.getId(), owner.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("charged on its parent account '" + parent.getName() + "'");
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(child.getId())).isEmpty();
    }

    @Test
    void interestChargesOnlyTheDaysASaleWasOutstandingInThePeriod() {
        CreditClient client = saveClient(new BigDecimal("3.00"));
        seedChargeEndingOn(client, "500.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(client, "50000.00", LocalDate.of(2025, 11, 29));

        interestService.applyToClientGroupInNewTransaction(client.getId(), LocalDate.of(2025, 11, 30), "MANUAL", owner.getId());

        CreditInterestCharge charge = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0);
        // ₹50,000 × 3% / 30 per day × 2 days (29th and 30th); the earlier ₹500 interest is not charged again
        assertThat(charge.getAmount()).isEqualByComparingTo("100.00");
        assertThat(charge.getOutstandingBalance()).isEqualByComparingTo("50000.00");
        assertThat(charge.getPeriodFrom()).isEqualTo(LocalDate.of(2025, 11, 1));
    }

    @Test
    void paymentInTheMiddleOfThePeriodLowersInterestFromItsDate() {
        CreditClient client = saveClient(new BigDecimal("3.00"));
        seedChargeEndingOn(client, "0.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(client, "30000.00", LocalDate.of(2025, 11, 1));
        CreditPayment payment = savePayment(client, "10000.00", ExpenseApprovalStatus.APPROVED, owner);
        payment.setPaidAt(LocalDate.of(2025, 11, 16));
        paymentRepository.save(payment);

        interestService.applyToClientGroupInNewTransaction(client.getId(), LocalDate.of(2025, 11, 30), "MANUAL", owner.getId());

        // 15 days × ₹30,000 × 0.1% + 15 days × ₹20,000 × 0.1%
        assertThat(interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0).getAmount())
                .isEqualByComparingTo("750.00");
    }

    @Test
    void interestRecoveredCountsOnlyInterestThatPaymentsPaidOff() {
        CreditClient client = saveClient(new BigDecimal("3.00"));
        seedChargeEndingOn(client, "500.00", TestDates.today().minusDays(10));

        assertThat(interestService.computeTotalInterestRecovered(client.getId())).isEqualByComparingTo("0.00");

        savePayment(client, "200.00", ExpenseApprovalStatus.APPROVED, owner);

        assertThat(interestService.computeTotalInterestRecovered(client.getId())).isEqualByComparingTo("200.00");
    }

    @Test
    void runningInterestTwiceForTheSamePeriodChargesItOnce() {
        CreditClient client = saveClient(new BigDecimal("3.00"));
        seedChargeEndingOn(client, "10.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(client, "30000.00", LocalDate.of(2025, 11, 1));
        LocalDate periodTo = LocalDate.of(2025, 11, 30);

        interestService.applyToClientGroupInNewTransaction(client.getId(), periodTo, "SCHEDULED", null);
        int chargedByTheRepeat =
                interestService.applyToClientGroupInNewTransaction(client.getId(), periodTo, "SCHEDULED", null);

        assertThat(chargedByTheRepeat).isZero();
        List<CreditInterestCharge> charges = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId());
        assertThat(charges).hasSize(2);
        // ₹30,000 × 3% / 30 per day × 30 days of November
        assertThat(charges.get(0).getAmount()).isEqualByComparingTo("900.00");
    }

    @Test
    void waivingAnInterestChargeKeepsTheRowButTakesItsAmountOffTheOutstandingBalance() {
        CreditClient client = saveClient(new BigDecimal("2.00"));
        saveCreditSaleOn(client, "1000.00", TestDates.today().minusDays(5));
        seedChargeEndingOn(client, "40.00", TestDates.today().minusDays(1));
        CreditInterestCharge charge = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0);
        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("1040.00");

        ledgerService.waiveInterestCharge(pump.getId(), client.getId(), charge.getId(), "Agreed with the client", owner);

        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("1000.00");
        CreditInterestCharge waived = interestChargeRepository.findById(charge.getId()).orElseThrow();
        assertThat(waived.getVoidedAt()).isNotNull();
        assertThat(waived.getVoidedBy()).isEqualTo(owner.getId());
        assertThat(waived.getVoidReason()).isEqualTo("Agreed with the client");
        assertThat(interestService.computeInterestBreakdownBatch(List.of(client.getId())).get(client.getId())
                .outstandingInterest()).isEqualByComparingTo("0");
        assertThat(ledgerQueryService.getAllTransactions(client, false))
                .filteredOn(row -> "INTEREST".equals(row.getType()))
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.getStatus()).isEqualTo("WAIVED");
                    assertThat(row.isCountedInBalance()).isFalse();
                });
    }

    @Test
    void waivingAnInterestChargeNeedsAReasonAndCannotBeDoneTwice() {
        CreditClient client = saveClient(new BigDecimal("2.00"));
        seedChargeEndingOn(client, "40.00", TestDates.today().minusDays(1));
        CreditInterestCharge charge = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0);

        assertThatThrownBy(() -> ledgerService.waiveInterestCharge(pump.getId(), client.getId(), charge.getId(), " ", owner))
                .isInstanceOf(BusinessException.class);
        ledgerService.waiveInterestCharge(pump.getId(), client.getId(), charge.getId(), "Wrong rate", owner);
        assertThatThrownBy(() -> ledgerService.waiveInterestCharge(pump.getId(), client.getId(), charge.getId(), "Again", owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already been waived");
    }

    @Test
    void periodOfAWaivedLatestChargeCanBeChargedAgain() {
        CreditClient client = saveClient(new BigDecimal("3.00"));
        seedChargeEndingOn(client, "10.00", LocalDate.of(2025, 10, 31));
        saveCreditSaleOn(client, "30000.00", LocalDate.of(2025, 11, 1));
        LocalDate periodTo = LocalDate.of(2025, 11, 30);
        interestService.applyToClientGroupInNewTransaction(client.getId(), periodTo, "SCHEDULED", null);
        CreditInterestCharge novemberCharge =
                interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0);
        assertThat(novemberCharge.getPeriodFrom()).isEqualTo(LocalDate.of(2025, 11, 1));

        ledgerService.waiveInterestCharge(pump.getId(), client.getId(), novemberCharge.getId(), "Rate was wrong", owner);
        int chargedAgain = interestService.applyToClientGroupInNewTransaction(client.getId(), periodTo, "SCHEDULED", null);

        assertThat(chargedAgain).isEqualTo(1);
        CreditInterestCharge recharged = interestChargeRepository.findByClientIdOrderByCreatedAtDesc(client.getId()).get(0);
        assertThat(recharged.getId()).isNotEqualTo(novemberCharge.getId());
        assertThat(recharged.getPeriodFrom()).isEqualTo(LocalDate.of(2025, 11, 1));
        assertThat(recharged.getPeriodTo()).isEqualTo(periodTo);
        assertThat(recharged.getAmount()).isEqualByComparingTo("900.00");
        // ₹30,000 of sales + ₹10 seeded charge + ₹900 recharged November; the waived ₹900 is not owed
        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("30910.00");
    }

    @Test
    void interestChargeOfAnotherClientCannotBeWaivedThroughThisClient() {
        CreditClient client = saveClient(new BigDecimal("2.00"));
        CreditClient otherClient = saveClient(new BigDecimal("2.00"));
        seedChargeEndingOn(otherClient, "40.00", TestDates.today().minusDays(1));
        CreditInterestCharge othersCharge =
                interestChargeRepository.findByClientIdOrderByCreatedAtDesc(otherClient.getId()).get(0);

        assertThatThrownBy(() -> ledgerService.waiveInterestCharge(
                pump.getId(), client.getId(), othersCharge.getId(), "Not owed", owner))
                .isInstanceOf(BusinessException.class);

        assertThat(interestChargeRepository.findById(othersCharge.getId()).orElseThrow().getVoidedAt()).isNull();
    }

    @Test
    void movingAPaymentToASubAccountMovesItsCreditBetweenTheTwoBalances() {
        CreditClient parent = saveClient(BigDecimal.ZERO);
        CreditClient child = saveClient(BigDecimal.ZERO);
        child.setParentClientId(parent.getId());
        clientRepository.save(child);
        saveCreditSaleOn(parent, "1000.00", TestDates.today().minusDays(2));
        saveCreditSaleOn(child, "600.00", TestDates.today().minusDays(2));
        CreditPayment payment = savePayment(parent, "400.00", ExpenseApprovalStatus.APPROVED, manager);

        ledgerService.reassignCreditPayment(pump.getId(), payment.getId(), reassignTo(child), owner);

        assertThat(interestService.computeOutstanding(parent.getId())).isEqualByComparingTo("1000.00");
        assertThat(interestService.computeOutstanding(child.getId())).isEqualByComparingTo("200.00");
        assertThat(interestService.computeOutstandingWithChildren(parent.getId())).isEqualByComparingTo("1200.00");
    }

    @Test
    void movingAPaymentToAnUnrelatedClientIsRefusedAndChangesNothing() {
        CreditClient client = saveClient(BigDecimal.ZERO);
        CreditClient unrelated = saveClient(BigDecimal.ZERO);
        saveCreditSaleOn(client, "1000.00", TestDates.today().minusDays(2));
        CreditPayment payment = savePayment(client, "400.00", ExpenseApprovalStatus.APPROVED, manager);

        assertThatThrownBy(() -> ledgerService.reassignCreditPayment(pump.getId(), payment.getId(), reassignTo(unrelated), owner))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("same parent");

        assertThat(paymentRepository.findById(payment.getId()).orElseThrow().getClientId()).isEqualTo(client.getId());
        assertThat(interestService.computeOutstanding(client.getId())).isEqualByComparingTo("600.00");
    }

    private static ReassignCreditEntryRequest reassignTo(CreditClient target) {
        ReassignCreditEntryRequest request = new ReassignCreditEntryRequest();
        request.setToClientId(target.getId());
        request.setReason("Recorded against the wrong account");
        return request;
    }

    private void saveCreditSaleOn(CreditClient client, String amount, LocalDate day) {
        Shift shift = saveClosedShift(day, ShiftStatus.CLOSED_BALANCED, null);
        ShiftCreditEntry entry = creditEntryRepository.save(ShiftCreditEntry.builder()
                .shiftId(shift.getId())
                .clientId(client.getId())
                .clientName(client.getName())
                .fuelType(FuelType.PETROL.name())
                .amount(new BigDecimal(amount))
                .saleDate(day)
                .build());
        jdbcTemplate.update("UPDATE shift_credit_entries SET created_at = ? WHERE id = ?",
                day.atTime(12, 0).atZone(ZoneId.of("Asia/Kolkata")).toOffsetDateTime(), entry.getId());
    }

    private void saveCounterSaleOn(CreditClient client, String amount, LocalDate day) {
        AncillaryProduct product = saveProductWithStockAndPrice(amount);
        ancillarySaleRepository.save(AncillarySale.builder()
                .pumpId(pump.getId())
                .productId(product.getId())
                .quantityUnits(1)
                .sellingPricePerUnit(new BigDecimal(amount))
                .totalAmount(new BigDecimal(amount))
                .gstAmount(BigDecimal.ZERO.setScale(2))
                .totalWithGst(new BigDecimal(amount))
                .gstRatePercent(new BigDecimal("18.00"))
                .paymentMode(TransactionPaymentMode.CREDIT)
                .clientId(client.getId())
                .clientName(client.getName())
                .soldByUserId(manager.getId())
                .saleDate(day)
                .build());
    }

    private AncillaryProduct saveProductWithStockAndPrice(String price) {
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
                .pricePerUnit(new BigDecimal(price))
                .effectiveFrom(TestDates.now().minusDays(1))
                .setByUserId(owner.getId())
                .build());
        return product;
    }

    private static RecordAncillarySaleRequest creditSale(AncillaryProduct product, CreditClient client, int quantity) {
        RecordAncillarySaleRequest request = new RecordAncillarySaleRequest();
        request.setProductId(product.getId());
        request.setQuantityUnits(quantity);
        request.setSellingPricePerUnit(new BigDecimal("400.00"));
        request.setPaymentMode(TransactionPaymentMode.CREDIT);
        request.setClientId(client.getId());
        return request;
    }

    private CreditClient saveSubAccount(CreditClient parent) {
        return clientRepository.save(CreditClient.builder()
                .pumpId(pump.getId())
                .name("Child " + shortId())
                .parentClientId(parent.getId())
                .monthlyInterestRate(BigDecimal.ZERO)
                .build());
    }

    private ShiftCreditEntry saveUnlinkedCreditEntry(Shift shift, String amount) {
        return creditEntryRepository.save(ShiftCreditEntry.builder()
                .shiftId(shift.getId())
                .clientName("Free text " + shortId())
                .fuelType(FuelType.PETROL.name())
                .amount(new BigDecimal(amount))
                .saleDate(shift.getShiftDate())
                .build());
    }

    private void seedChargeEndingOn(CreditClient client, String amount, LocalDate periodTo) {
        interestChargeRepository.save(CreditInterestCharge.builder()
                .pumpId(pump.getId())
                .clientId(client.getId())
                .amount(new BigDecimal(amount))
                .outstandingBalance(BigDecimal.ZERO)
                .rateApplied(BigDecimal.ONE)
                .daysApplied(1)
                .periodFrom(periodTo)
                .periodTo(periodTo)
                .source("TEST_SEED")
                .build());
    }

    private GeneratePayrollRequest payrollRequest(Shift discrepancyToDeduct) {
        GeneratePayrollRequest request = new GeneratePayrollRequest();
        request.setUserId(operator.getId());
        request.setPeriodFrom(TestDates.today().minusDays(7));
        request.setPeriodTo(TestDates.today());
        request.setDeductFromSalaryShiftIds(discrepancyToDeduct == null ? null : List.of(discrepancyToDeduct.getId()));
        return request;
    }

    private Shift saveClosedShift(LocalDate shiftDate, ShiftStatus status, String discrepancyAmount) {
        OffsetDateTime start = shiftDate.atTime(9, 0).atOffset(TestDates.now().getOffset());
        return shiftRepository.save(Shift.builder()
                .pumpId(pump.getId())
                .duId(du.getId())
                .operatorId(operator.getId())
                .openedByUserId(manager.getId())
                .shiftDate(shiftDate)
                .actualStartTime(start)
                .actualEndTime(start.plusHours(8))
                .status(status)
                .discrepancyAmount(discrepancyAmount == null ? null : new BigDecimal(discrepancyAmount))
                .discrepancyType(discrepancyAmount == null ? null : DiscrepancyType.SHORT)
                .build());
    }

    private Shift saveOverDiscrepancy(ShiftStatus status, DiscrepancyResolution resolution) {
        Shift over = saveClosedShift(TestDates.today().minusDays(3), status, "75.00");
        over.setDiscrepancyType(DiscrepancyType.OVER);
        over.setDiscrepancyResolution(resolution);
        return shiftRepository.save(over);
    }

    private CreditClient saveClient(BigDecimal monthlyInterestRate) {
        return clientRepository.save(CreditClient.builder()
                .pumpId(pump.getId())
                .name("Client " + shortId())
                .monthlyInterestRate(monthlyInterestRate)
                .build());
    }

    private void saveCreditSale(Shift shift, CreditClient client, String amount, String voidStatus) {
        creditEntryRepository.save(ShiftCreditEntry.builder()
                .shiftId(shift.getId())
                .clientId(client.getId())
                .clientName(client.getName())
                .fuelType(FuelType.PETROL.name())
                .amount(new BigDecimal(amount))
                .saleDate(shift.getShiftDate())
                .voidStatus(voidStatus)
                .build());
    }

    private CreditPayment savePayment(CreditClient client, String amount, ExpenseApprovalStatus status, User recordedBy) {
        return paymentRepository.save(CreditPayment.builder()
                .pumpId(pump.getId())
                .clientId(client.getId())
                .amount(new BigDecimal(amount))
                .paymentMode(PaymentMode.CASH)
                .paidAt(TestDates.today())
                .recordedById(recordedBy.getId())
                .paymentApprovalStatus(status)
                .build());
    }

    /** An earlier charge gives the client an outstanding balance and fixes where the next interest period starts. */
    private void seedOutstandingInterest(CreditClient client, String amount, int daysAgo) {
        LocalDate periodTo = TestDates.today().minusDays(daysAgo);
        interestChargeRepository.save(CreditInterestCharge.builder()
                .pumpId(pump.getId())
                .clientId(client.getId())
                .amount(new BigDecimal(amount))
                .outstandingBalance(BigDecimal.ZERO)
                .rateApplied(BigDecimal.ONE)
                .daysApplied(1)
                .periodFrom(periodTo)
                .periodTo(periodTo)
                .source("TEST_SEED")
                .build());
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

    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
