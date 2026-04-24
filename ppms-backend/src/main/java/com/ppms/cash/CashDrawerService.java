package com.ppms.cash;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
@RequiredArgsConstructor
public class CashDrawerService {

    private final CashEventRepository cashEventRepository;
    private final PumpLocationRepository pumpLocationRepository;

    /**
     * Records a cash movement for a pump's drawer.
     *
     * For CASH_OUT events the method first acquires a row-level write lock on the pump row
     * to serialize concurrent requests. The balance is then computed via a DB aggregate
     * query (within the same transaction) before the guard check and save.
     * This eliminates the TOCTOU race that existed when balance was read and checked outside
     * a transaction.
     */
    @Transactional
    public CashEvent recordCashEvent(Long pumpId, RecordCashEventRequest req, User currentUser) {
        BigDecimal amount = req.getAmount().setScale(2, RoundingMode.HALF_UP);

        if (req.getEventType() == CashEventType.CASH_OUT) {
            // Lock the pump row for the duration of this transaction so that no other
            // CASH_OUT request for the same pump can read the balance until we commit.
            pumpLocationRepository.findByIdForUpdate(pumpId)
                    .orElseThrow(() -> new ResourceNotFoundException("Pump not found: " + pumpId));

            BigDecimal currentBalance = cashEventRepository.computeBalance(pumpId);
            if (amount.compareTo(currentBalance) > 0) {
                throw new BusinessException(
                        "Cash-out amount ₹" + amount
                        + " exceeds the current drawer balance of ₹" + currentBalance + ".");
            }
        }

        CashEvent event = CashEvent.builder()
                .pumpId(pumpId)
                .eventType(req.getEventType())
                .amount(amount)
                .description(req.getDescription().trim())
                .eventDate(req.getEventDate())
                .recordedByUserId(currentUser.getId())
                .build();

        return cashEventRepository.save(event);
    }
}
