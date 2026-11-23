package com.ppms.credit;

import java.util.Map;

/**
 * What an operator's credit client picker needs: who the client is and whether it is enabled. No balance, limit,
 * notes or billing details.
 */
public record CreditClientPickerResponse(Long id, Long pumpId, String name, String phone, Long parentClientId,
                                         String parentClientName, Boolean isParent, Boolean isActive) {

    static CreditClientPickerResponse from(CreditClient client, Map<Long, String> nameById, boolean isParent) {
        return new CreditClientPickerResponse(client.getId(), client.getPumpId(), client.getName(), client.getPhone(),
                client.getParentClientId(),
                client.getParentClientId() != null ? nameById.get(client.getParentClientId()) : null,
                isParent, client.isActive());
    }
}
