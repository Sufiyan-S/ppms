package com.ppms.shift;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import com.ppms.user.UserRepository;
import com.ppms.user.UserRole;
import com.ppms.user.UserStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Opening, backfilling and handing over all look the operator up here, so an inactive operator is refused everywhere. */
@ExtendWith(MockitoExtension.class)
class InactiveOperatorAssignmentTest {

    private static final long PUMP_ID = 4L;

    @Mock private UserRepository userRepository;
    @Mock private ShiftRepository shiftRepository;

    @InjectMocks private ShiftLifecycleSupportService lifecycleSupportService;

    @Test
    void activeOperatorOfThePumpIsFound() {
        User operator = operator(UserStatus.ACTIVE);
        when(userRepository.findById(8L)).thenReturn(Optional.of(operator));

        assertThat(lifecycleSupportService.findOperatorForPump(8L, PUMP_ID)).isSameAs(operator);
    }

    @Test
    void inactiveOperatorCannotBeAssignedAShift() {
        when(userRepository.findById(8L)).thenReturn(Optional.of(operator(UserStatus.INACTIVE)));

        assertThatThrownBy(() -> lifecycleSupportService.findOperatorForPump(8L, PUMP_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("inactive");
    }

    @Test
    void inactiveOperatorCannotReceiveAHandover() {
        ShiftHandoverService handoverService = new ShiftHandoverService(
                mock(ShiftHandoverRepository.class), shiftRepository, userRepository, mock(ShiftService.class),
                mock(ShiftReadModelService.class), mock(BusinessClock.class));
        Shift outgoing = Shift.builder().id(30L).pumpId(PUMP_ID).operatorId(7L).status(ShiftStatus.OPEN).build();
        when(shiftRepository.findByIdAndPumpIdForUpdate(30L, PUMP_ID)).thenReturn(Optional.of(outgoing));
        when(userRepository.findById(8L)).thenReturn(Optional.of(operator(UserStatus.INACTIVE)));
        User manager = User.builder().id(2L).role(UserRole.MANAGER).assignedPumpId(PUMP_ID).build();

        assertThatThrownBy(() -> handoverService.createHandover(PUMP_ID,
                new CreateHandoverRequest(30L, 8L, true, true, null, new CloseShiftRequest()), manager))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("inactive");
    }

    private static User operator(UserStatus status) {
        return User.builder()
                .id(8L)
                .fullName("Ravi")
                .role(UserRole.OPERATOR)
                .status(status)
                .assignedPumpId(PUMP_ID)
                .build();
    }
}
