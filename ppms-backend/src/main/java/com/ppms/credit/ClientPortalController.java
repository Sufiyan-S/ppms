package com.ppms.credit;

import com.ppms.auth.ClientIpResolver;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

/**
 * Public credit balance lookup, whitelisted in SecurityConfig at /api/public/**.
 * A client proves who they are with their phone number and the portal PIN the pump owner set for them.
 * Every failure gets the same answer so the page cannot be used to find out which phones are clients.
 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class ClientPortalController {

    private static final String NOT_FOUND_MESSAGE = "No credit account matches these details.";

    private final CreditClientRepository creditClientRepository;
    private final PumpLocationRepository pumpLocationRepository;
    private final CreditInterestService creditInterestService;
    private final CreditBalanceLookupLimiter lookupLimiter;
    private final ClientIpResolver clientIpResolver;
    private final PasswordEncoder passwordEncoder;
    // Compared against when no client matches, so a wrong phone takes as long as a wrong PIN.
    private volatile String unusedPinHash;

    @PostMapping("/credit-balance")
    public CreditBalanceLookupResponse getBalance(@Valid @RequestBody CreditBalanceLookupRequest lookup,
                                                  HttpServletRequest request) {
        lookupLimiter.checkLookupAllowed(clientIpResolver.resolve(request), lookup.pumpId(), lookup.phone());

        CreditClient client = findClientWithPin(lookup)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND_MESSAGE));

        return new CreditBalanceLookupResponse(
                creditInterestService.computeOutstanding(client.getId()),
                client.getCreditLimit());
    }

    private Optional<CreditClient> findClientWithPin(CreditBalanceLookupRequest lookup) {
        boolean pumpOpen = pumpLocationRepository.findById(lookup.pumpId()).map(PumpLocation::isEnabled).orElse(false);
        var candidates = pumpOpen
                ? creditClientRepository.findAllByPumpIdAndPhoneAndIsActiveTrue(lookup.pumpId(), lookup.phone()).stream()
                        .filter(client -> client.getPortalPinHash() != null)
                        .toList()
                : List.<CreditClient>of();
        if (candidates.isEmpty()) {
            passwordEncoder.matches(lookup.pin(), unusedPinHash());
            return Optional.empty();
        }
        return candidates.stream()
                .filter(client -> passwordEncoder.matches(lookup.pin(), client.getPortalPinHash()))
                .findFirst();
    }

    private String unusedPinHash() {
        if (unusedPinHash == null) {
            unusedPinHash = passwordEncoder.encode("000000");
        }
        return unusedPinHash;
    }
}
