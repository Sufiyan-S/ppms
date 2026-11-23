package com.ppms.planning;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpShiftDefinition;
import com.ppms.pump.PumpShiftDefinitionRepository;
import com.ppms.user.User;
import com.ppms.user.UserGender;
import com.ppms.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class ShiftPlanningRuleService {

    private final UserRepository userRepository;
    private final PumpShiftDefinitionRepository shiftDefinitionRepository;

    public void validateOperatorForPump(Long operatorUserId, Long pumpId) {
        User operator = userRepository.findById(operatorUserId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OPERATOR, "Operator not found"));
        if (!pumpId.equals(operator.getAssignedPumpId())) {
            throw new ResourceNotFoundException(EntityType.OPERATOR, "Operator not found");
        }
    }

    public void validateNightShiftEligibility(Long operatorUserId, Long shiftDefinitionId, Long pumpId) {
        PumpShiftDefinition definition = shiftDefinitionRepository.findByIdAndPumpId(shiftDefinitionId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.SHIFT_DEFINITION,
                        "Shift definition not found"));
        if (!definition.isNightShift()) {
            return;
        }

        User operator = userRepository.findById(operatorUserId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.OPERATOR, "Operator not found"));
        if (isNightShiftRestricted(operator)) {
            throw new BusinessException(ErrorCodes.NIGHT_SHIFT_CONSENT_REQUIRED,
                    Map.of("operatorName", operator.getFullName()),
                    operator.getFullName() + " cannot be assigned to the night shift without explicit consent."
            );
        }
    }

    public boolean isNightShiftRestricted(User user) {
        return user.getGender() == UserGender.FEMALE && !user.isNightShiftConsent();
    }
}
