package com.ppms.planning;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.user.User;
import com.ppms.user.UserGender;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ShiftPlanningRuleService {

    private final UserRepository userRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;

    public void validateOperatorForPump(Long operatorUserId, Long pumpId) {
        User operator = userRepository.findById(operatorUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));
        if (!pumpId.equals(operator.getAssignedPumpId())) {
            throw new BusinessException("Operator " + operator.getFullName() + " is not assigned to this pump.");
        }
    }

    public void validateNightShiftEligibility(Long operatorUserId, Long shiftDefinitionId) {
        PumpShiftDefinition definition = shiftDefinitionRepository.findById(shiftDefinitionId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift definition not found"));
        if (!definition.isNightShift()) {
            return;
        }

        User operator = userRepository.findById(operatorUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Operator not found"));
        if (isNightShiftRestricted(operator)) {
            throw new BusinessException(
                    operator.getFullName() + " cannot be assigned to the night shift without explicit consent."
            );
        }
    }

    public boolean isNightShiftRestricted(User user) {
        return user.getGender() == UserGender.FEMALE && !user.isNightShiftConsent();
    }
}
