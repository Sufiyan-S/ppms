package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.fuel.FuelType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShiftClosingReadingsTest {

    private static final Long NOZZLE_ID = 11L;
    private static final BigDecimal MAX_METER = new BigDecimal("999999.999");

    @Mock private ShiftFuelReadingRepository fuelReadingRepository;
    @Mock private ShiftCreditEntryRepository creditEntryRepository;
    @InjectMocks private ShiftLifecycleSupportService lifecycleSupportService;

    @Test
    void closingReadingJustBelowOpeningIsRejectedInsteadOfCountedAsRollover() {
        ShiftFuelReading reading = readingStartingAt("5000.000");

        assertThatThrownBy(() -> lifecycleSupportService.processClosingReadings(
                1L, Map.of(NOZZLE_ID, MAX_METER), closeRequest("4999.000", "0.00"), List.of(reading)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("is below the opening reading");
    }

    @Test
    void meterAtTheTopOfItsRangeRollsOverToZero() {
        ShiftFuelReading reading = readingStartingAt("999990.000");

        ShiftLifecycleSupportService.ClosingSummary summary = lifecycleSupportService.processClosingReadings(
                1L, Map.of(NOZZLE_ID, MAX_METER), closeRequest("5.001", "1500.00"), List.of(reading));

        assertThat(reading.getUnitsSold()).isEqualByComparingTo("15.000");
        assertThat(summary.getTotalDue()).isEqualByComparingTo("1500.00");
    }

    @Test
    void rolloverIsAcceptedWhenTheOpeningReadingIsExactlyNinetyNinePercentOfTheMeterRange() {
        BigDecimal roundMaxMeter = new BigDecimal("1000000.000");
        ShiftFuelReading reading = readingStartingAt("990000.000");

        lifecycleSupportService.processClosingReadings(
                1L, Map.of(NOZZLE_ID, roundMaxMeter), closeRequest("5.000", "1000500.00"), List.of(reading));

        assertThat(reading.getUnitsSold()).isEqualByComparingTo("10005.000");
    }

    @Test
    void rolloverIsRefusedWhenTheOpeningReadingIsJustUnderNinetyNinePercentOfTheMeterRange() {
        BigDecimal roundMaxMeter = new BigDecimal("1000000.000");
        ShiftFuelReading reading = readingStartingAt("989999.999");

        assertThatThrownBy(() -> lifecycleSupportService.processClosingReadings(
                1L, Map.of(NOZZLE_ID, roundMaxMeter), closeRequest("5.000", "0.00"), List.of(reading)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("is below the opening reading");
    }

    @Test
    void theSameNozzleTwiceInOneRequestIsRejected() {
        CloseShiftRequest request = closeRequest("5010.000", "1000.00");
        request.setFuelReadings(List.of(
                new CloseShiftRequest.OutletEndReadingRequest(NOZZLE_ID, new BigDecimal("5010.000")),
                new CloseShiftRequest.OutletEndReadingRequest(NOZZLE_ID, new BigDecimal("5020.000"))));

        assertThatThrownBy(() -> lifecycleSupportService.processClosingReadings(
                1L, Map.of(NOZZLE_ID, MAX_METER), request, List.of(readingStartingAt("5000.000"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("only appear once");
    }

    @Test
    void zeroCreditTotalIsRejectedWhileAnEntryRecordedDuringTheShiftIsActive() {
        when(creditEntryRepository.findByShiftId(1L)).thenReturn(List.of(activeCreditEntry(7L, "250.00")));

        assertThatThrownBy(() -> lifecycleSupportService.validateCloseCreditEntries(1L, BigDecimal.ZERO, List.of(), List.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("₹250.00 was already recorded during the shift");
    }

    @Test
    void zeroCreditTotalIsAcceptedWhenTheOnlyEntryIsBeingReplacedByNothing() {
        when(creditEntryRepository.findByShiftId(1L)).thenReturn(List.of(activeCreditEntry(7L, "250.00")));

        assertThat(lifecycleSupportService.validateCloseCreditEntries(1L, BigDecimal.ZERO, List.of(), List.of(7L)))
                .isEmpty();
    }

    private ShiftCreditEntry activeCreditEntry(Long id, String amount) {
        return ShiftCreditEntry.builder()
                .id(id)
                .shiftId(1L)
                .clientName("Fleet Co")
                .amount(new BigDecimal(amount))
                .build();
    }

    private ShiftFuelReading readingStartingAt(String start) {
        return ShiftFuelReading.builder()
                .shiftId(1L)
                .nozzleId(NOZZLE_ID)
                .fuelType(FuelType.PETROL)
                .startReading(new BigDecimal(start))
                .priceSnapshot(new BigDecimal("100.00"))
                .build();
    }

    private CloseShiftRequest closeRequest(String endReading, String cash) {
        CloseShiftRequest request = new CloseShiftRequest();
        request.setFuelReadings(List.of(new CloseShiftRequest.OutletEndReadingRequest(NOZZLE_ID, new BigDecimal(endReading))));
        request.setCashCollected(new BigDecimal(cash));
        request.setUpiCollected(BigDecimal.ZERO);
        request.setCardCollected(BigDecimal.ZERO);
        request.setFleetCardCollected(BigDecimal.ZERO);
        request.setCreditTotal(BigDecimal.ZERO);
        return request;
    }
}
