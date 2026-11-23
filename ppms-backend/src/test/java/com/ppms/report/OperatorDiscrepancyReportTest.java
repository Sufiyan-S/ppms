package com.ppms.report;

import com.ppms.credit.CreditClientRepository;
import com.ppms.credit.CreditInterestChargeRepository;
import com.ppms.expense.PumpExpenseRepository;
import com.ppms.shift.DiscrepancyType;
import com.ppms.shift.Shift;
import com.ppms.shift.ShiftRepository;
import com.ppms.shift.ShiftStatus;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OperatorDiscrepancyReportTest {

    private static final LocalDate DAY = LocalDate.of(2026, 3, 10);
    private static final long OPERATOR_ID = 7L;

    private final ShiftRepository shiftRepository = mock(ShiftRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ReportService reportService = new ReportService(shiftRepository, userRepository,
            mock(PumpExpenseRepository.class), mock(CreditInterestChargeRepository.class), mock(CreditClientRepository.class));

    @Test
    void discrepanciesWaitingForApprovalCountAsUnresolved() {
        when(shiftRepository.findClosedShiftsByDateRange(1L, DAY, DAY)).thenReturn(List.of(
                shortShift(1L, ShiftStatus.CLOSED_DISCREPANCY_PENDING),
                shortShift(2L, ShiftStatus.CLOSED_DISCREPANCY_PENDING_APPROVAL),
                shortShift(3L, ShiftStatus.CLOSED_DISCREPANCY_RESOLVED)));
        when(userRepository.findAllById(any())).thenReturn(List.of(User.builder().id(OPERATOR_ID).fullName("Ravi").build()));

        OperatorDiscrepancyReport report = reportService.buildOperatorDiscrepancyReport(1L, DAY, DAY);

        assertThat(report.operators()).singleElement()
                .satisfies(operator -> assertThat(operator.unresolvedCount()).isEqualTo(2));
    }

    private static Shift shortShift(Long id, ShiftStatus status) {
        return Shift.builder()
                .id(id)
                .operatorId(OPERATOR_ID)
                .shiftDate(DAY)
                .shiftName("Morning")
                .discrepancyType(DiscrepancyType.SHORT)
                .discrepancyAmount(new BigDecimal("50.00"))
                .status(status)
                .build();
    }
}
