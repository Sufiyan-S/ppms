package com.ppms.credit;

import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CreditClientAccessService {

    private final CreditClientRepository clientRepository;

    public CreditClient requireClientForPump(Long pumpId, Long clientId) {
        CreditClient client = clientRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Credit client not found"));

        if (!client.getPumpId().equals(pumpId)) {
            throw new BusinessException("Client does not belong to this pump");
        }
        return client;
    }

    public List<CreditClient> loadPumpClients(Long pumpId) {
        return clientRepository.findByPumpIdOrderByNameAsc(pumpId);
    }
}
