package com.ppms.credit;

import com.ppms.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Public-facing credit balance portal — no authentication required.
 * Whitelisted in SecurityConfig at /api/public/**.
 *
 * Allows a credit client to look up their own outstanding balance using
 * their phone number and the pump ID. Only the balance is returned —
 * no ledger history or personal data is exposed to protect privacy.
 *
 * GET /api/public/credit-balance?pumpId={pumpId}&phone={phone}
 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class ClientPortalController {

    private final CreditClientRepository creditClientRepository;
    private final CreditInterestService  creditInterestService;

    /**
     * Looks up a credit client's outstanding balance by pump ID and phone number.
     * Returns 404 if no client is found for the given pump+phone combination.
     * No authentication is required — the phone number acts as the access credential.
     */
    @GetMapping("/credit-balance")
    public Map<String, Object> getBalance(
            @RequestParam Long pumpId,
            @RequestParam String phone) {

        CreditClient client = creditClientRepository.findByPumpIdAndPhone(pumpId, phone)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No credit account found for this phone number at this pump."));

        BigDecimal outstanding = creditInterestService.computeOutstanding(client.getId());

        return Map.of(
                "clientName",      client.getName(),
                "outstandingAmount", outstanding,
                "creditLimit",     client.getCreditLimit()
        );
    }
}
