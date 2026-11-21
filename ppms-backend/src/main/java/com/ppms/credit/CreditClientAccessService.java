package com.ppms.credit;

import com.ppms.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CreditClientAccessService {

    private final CreditClientRepository clientRepository;

    public CreditClient requireClientForPump(Long pumpId, Long clientId) {
        return clientRepository.findById(clientId)
                .filter(client -> client.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Credit client not found"));
    }
}
