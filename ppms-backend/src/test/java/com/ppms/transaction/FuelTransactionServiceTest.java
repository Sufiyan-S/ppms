package com.ppms.transaction;

import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.fuel.FuelType;
import com.ppms.pump.NozzleRepository;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FuelTransactionServiceTest {

    private static final long PUMP_ID = 4L;
    private static final long SHIFT_ID = 30L;

    @Mock private FuelTransactionRepository transactionRepository;
    @Mock private ShiftRepository shiftRepository;
    @Mock private NozzleRepository nozzleRepository;

    @InjectMocks private FuelTransactionService service;

    @Test
    void operatorCannotRecordOnAnotherOperatorsShift() {
        when(shiftRepository.findByIdAndPumpIdForUpdate(SHIFT_ID, PUMP_ID)).thenReturn(Optional.of(openShiftOf(99L)));

        assertThatThrownBy(() -> service.recordTransaction(PUMP_ID, request(), user(5L, UserRole.OPERATOR)))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(transactionRepository, never()).save(any());
    }

    @Test
    void operatorCannotReadAnotherOperatorsShiftTransactions() {
        when(shiftRepository.findByIdAndPumpId(SHIFT_ID, PUMP_ID)).thenReturn(Optional.of(openShiftOf(99L)));

        assertThatThrownBy(() -> service.getTransactionsForShift(PUMP_ID, SHIFT_ID, user(5L, UserRole.OPERATOR)))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(transactionRepository, never()).findByShiftIdOrderByRecordedAtAsc(any());
    }

    @Test
    void operatorPumpHistoryIsLimitedToTheirOwnShifts() {
        Pageable page = PageRequest.of(0, 20);
        when(transactionRepository.findForOperatorShifts(PUMP_ID, 5L, page)).thenReturn(Page.empty());

        service.getTransactionsForPump(PUMP_ID, page, user(5L, UserRole.OPERATOR));

        verify(transactionRepository, never()).findByPumpIdOrderByRecordedAtDesc(any(), any());
    }

    @Test
    void managerPumpHistoryCoversTheWholePump() {
        Pageable page = PageRequest.of(0, 20);
        when(transactionRepository.findByPumpIdOrderByRecordedAtDesc(PUMP_ID, page)).thenReturn(Page.empty());

        service.getTransactionsForPump(PUMP_ID, page, user(6L, UserRole.MANAGER));

        verify(transactionRepository, never()).findForOperatorShifts(any(), any(), any());
    }

    private static Shift openShiftOf(long operatorId) {
        return Shift.builder().id(SHIFT_ID).pumpId(PUMP_ID).operatorId(operatorId).status(ShiftStatus.OPEN).build();
    }

    private static RecordFuelTransactionRequest request() {
        RecordFuelTransactionRequest request = new RecordFuelTransactionRequest();
        request.setShiftId(SHIFT_ID);
        request.setNozzleId(3L);
        request.setFuelType(FuelType.PETROL);
        request.setQuantityLitres(new BigDecimal("10"));
        request.setPricePerUnit(new BigDecimal("100"));
        request.setPaymentMode(TransactionPaymentMode.CASH);
        return request;
    }

    private static User user(long id, UserRole role) {
        return User.builder().id(id).role(role).assignedPumpId(PUMP_ID).build();
    }
}
