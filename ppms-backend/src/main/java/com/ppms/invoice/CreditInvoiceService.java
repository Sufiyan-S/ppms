package com.ppms.invoice;

import com.ppms.ancillary.AncillaryProduct;
import com.ppms.ancillary.AncillaryProductRepository;
import com.ppms.ancillary.AncillarySale;
import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.dto.PageRequests;
import com.ppms.common.dto.PagedResponse;
import com.ppms.common.exception.BusinessException;
import com.ppms.common.exception.EntityType;
import com.ppms.common.exception.ErrorCodes;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.credit.CreditClient;
import com.ppms.credit.CreditClientAccessService;
import com.ppms.pump.PumpLocation;
import com.ppms.pump.PumpLocationRepository;
import com.ppms.shift.ShiftCreditEntry;
import com.ppms.transaction.TransactionPaymentMode;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CreditInvoiceService {

    private static final String MISSING_GST_DETAILS_MESSAGE =
            "Add GST details in pump setup first (GSTIN, legal name and invoice prefix).";

    private final CreditInvoiceRepository invoiceRepository;
    private final CreditInvoiceLineRepository lineRepository;
    private final InvoiceSequenceRepository sequenceRepository;
    private final CreditClientAccessService clientAccessService;
    private final PumpLocationRepository pumpLocationRepository;
    private final AncillaryProductRepository productRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    /** Issues an invoice for every unbilled credit sale of the client in the period; refuses an empty one. */
    @Transactional
    public CreditInvoice issue(Long pumpId, Long clientId, LocalDate periodFrom, LocalDate periodTo, User issuedBy) {
        return issueIfAnythingToBill(pumpId, clientId, periodFrom, periodTo, issuedBy)
                .orElseThrow(() -> new BusinessException(ErrorCodes.INVOICE_NOTHING_TO_BILL,
                        Map.of("periodFrom", periodFrom.toString(), "periodTo", periodTo.toString()),
                        "Nothing to invoice: this client has no uninvoiced credit sales between "
                        + periodFrom + " and " + periodTo + "."));
    }

    /** Own transaction, so one client failing during a pump-wide run cannot undo the invoices of the others. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<CreditInvoice> issueInNewTransaction(Long pumpId, Long clientId, LocalDate periodFrom,
                                                         LocalDate periodTo, User issuedBy) {
        return issueIfAnythingToBill(pumpId, clientId, periodFrom, periodTo, issuedBy);
    }

    @Transactional
    public CreditInvoice cancel(Long pumpId, Long invoiceId, String reason, User cancelledBy) {
        CreditInvoice invoice = invoiceRepository.findByIdAndPumpIdForUpdate(invoiceId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.INVOICE, "Invoice not found"));
        if (invoice.getStatus() == CreditInvoiceStatus.CANCELLED) {
            throw new BusinessException(ErrorCodes.INVOICE_ALREADY_CANCELLED,
                    Map.of("invoiceNumber", invoice.getInvoiceNumber()),
                    "Invoice " + invoice.getInvoiceNumber() + " is already cancelled.");
        }
        invoice.setStatus(CreditInvoiceStatus.CANCELLED);
        invoice.setCancelReason(reason.trim());
        invoice.setCancelledBy(cancelledBy.getId());
        invoice.setCancelledAt(businessClock.now());
        lineRepository.releaseLinesOfInvoice(invoice.getId());
        invoice = invoiceRepository.save(invoice);

        auditService.log(pumpId, AuditAction.CREDIT_INVOICE_CANCELLED, "CreditInvoice", invoice.getId().toString(),
                "Invoice " + invoice.getInvoiceNumber() + " cancelled: " + invoice.getCancelReason(), cancelledBy);
        log.info("Credit invoice cancelled: pump={}, invoice={}, number={}", pumpId, invoice.getId(), invoice.getInvoiceNumber());
        return invoice;
    }

    @Transactional(readOnly = true)
    public PagedResponse<CreditInvoiceResponse> listInvoices(Long pumpId, Long clientId, int page, int size) {
        Page<CreditInvoice> invoices;
        if (clientId == null) {
            invoices = invoiceRepository.findByPumpIdOrderByIssuedOnDescIdDesc(pumpId, PageRequests.of(page, size));
        } else {
            clientAccessService.requireClientForPump(pumpId, clientId);
            invoices = invoiceRepository.findByPumpIdAndClientIdOrderByIssuedOnDescIdDesc(
                    pumpId, clientId, PageRequests.of(page, size));
        }
        return PagedResponse.of(invoices.map(CreditInvoiceResponse::from));
    }

    @Transactional(readOnly = true)
    public CreditInvoice requireInvoiceForPump(Long pumpId, Long invoiceId) {
        return invoiceRepository.findByIdAndPumpId(invoiceId, pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.INVOICE, "Invoice not found"));
    }

    @Transactional(readOnly = true)
    public List<CreditInvoiceLine> linesOf(CreditInvoice invoice) {
        return lineRepository.findByInvoiceIdOrderByLineTypeAscSaleDateAscIdAsc(invoice.getId());
    }

    /**
     * The clients and total a pump-wide run would invoice for the period: the same uninvoiced sales and the same
     * line totals as {@link #issueInNewTransaction}, read for the whole pump at once and without writing anything.
     */
    @Transactional(readOnly = true)
    public InvoiceRunPreview previewForAllClients(Long pumpId, LocalDate periodFrom, LocalDate periodTo) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found"));
        validatePeriod(periodFrom, periodTo);

        Map<Long, List<ShiftCreditEntry>> fuelByClient = lineRepository
                .findUninvoicedFuelEntriesOfPump(pumpId, periodFrom, periodTo).stream()
                .collect(Collectors.groupingBy(ShiftCreditEntry::getClientId));
        List<AncillarySale> ancillarySales = lineRepository.findUninvoicedAncillarySalesOfPump(
                pumpId, TransactionPaymentMode.CREDIT, periodFrom, periodTo);
        Map<Long, List<AncillarySale>> ancillaryByClient = ancillarySales.stream()
                .collect(Collectors.groupingBy(AncillarySale::getClientId));
        Map<Long, AncillaryProduct> productsById = productsOf(ancillarySales);

        Set<Long> clientIds = new HashSet<>(fuelByClient.keySet());
        clientIds.addAll(ancillaryByClient.keySet());
        BigDecimal total = BigDecimal.ZERO.setScale(2);
        for (Long clientId : clientIds) {
            List<CreditInvoiceLine> lines = new ArrayList<>(
                    CreditInvoiceLineBuilder.fuelLines(fuelByClient.getOrDefault(clientId, List.of())));
            lines.addAll(CreditInvoiceLineBuilder.ancillaryLines(
                    ancillaryByClient.getOrDefault(clientId, List.of()), productsById, true));
            total = total.add(withTotals(CreditInvoice.builder(), lines).build().getGrandTotal());
        }
        return new InvoiceRunPreview(clientIds.size(), total, hasGstDetails(pump));
    }

    public InvoicePeriod defaultPeriod(Long pumpId, Long clientId) {
        CreditClient client = clientAccessService.requireClientForPump(pumpId, clientId);
        return InvoicePeriod.lastCompletedCycle(client.getBillingCycle(), businessClock.today());
    }

    /** Throws when the pump cannot issue tax invoices yet, so a pump-wide run fails before touching any client. */
    public PumpLocation requirePumpWithGstDetails(Long pumpId) {
        PumpLocation pump = pumpLocationRepository.findById(pumpId)
                .orElseThrow(() -> new ResourceNotFoundException(EntityType.PUMP, "Pump not found"));
        if (!hasGstDetails(pump)) {
            throw new BusinessException(ErrorCodes.INVOICE_GST_DETAILS_MISSING, Map.of(), MISSING_GST_DETAILS_MESSAGE);
        }
        return pump;
    }

    public static boolean hasGstDetails(PumpLocation pump) {
        return pump.getGstin() != null && pump.getLegalName() != null && pump.getInvoicePrefix() != null;
    }

    public void validatePeriod(LocalDate periodFrom, LocalDate periodTo) {
        if (periodFrom.isAfter(periodTo)) {
            throw new BusinessException(ErrorCodes.INVOICE_PERIOD_START_AFTER_END,
                    Map.of(),
                    "The period start must be on or before its end.");
        }
        if (periodTo.isAfter(businessClock.today())) {
            throw new BusinessException(ErrorCodes.INVOICE_PERIOD_ENDS_IN_FUTURE,
                    Map.of(),
                    "The period cannot end after today.");
        }
    }

    private Optional<CreditInvoice> issueIfAnythingToBill(Long pumpId, Long clientId, LocalDate periodFrom,
                                                          LocalDate periodTo, User issuedBy) {
        CreditClient client = clientAccessService.requireClientForPump(pumpId, clientId);
        PumpLocation pump = requirePumpWithGstDetails(pumpId);
        validatePeriod(periodFrom, periodTo);

        LocalDate issuedOn = businessClock.today();
        String financialYear = InvoiceNumbering.financialYearOf(issuedOn);
        // Locked before reading the sales: a concurrent issue for this pump waits here and then sees our lines.
        InvoiceSequence sequence = lockSequence(pumpId, financialYear);

        List<ShiftCreditEntry> fuelEntries = lineRepository.findUninvoicedFuelEntries(clientId, periodFrom, periodTo);
        List<AncillarySale> ancillarySales = lineRepository.findUninvoicedAncillarySales(
                pumpId, clientId, TransactionPaymentMode.CREDIT, periodFrom, periodTo);
        if (fuelEntries.isEmpty() && ancillarySales.isEmpty()) {
            return Optional.empty();
        }

        String invoiceNumber = InvoiceNumbering.invoiceNumber(pump.getInvoicePrefix(), financialYear, sequence.getNextNumber());
        String sellerStateCode = GstFields.stateCodeOf(pump.getGstin());
        String buyerStateCode = client.getGstin() != null ? GstFields.stateCodeOf(client.getGstin()) : sellerStateCode;

        List<CreditInvoiceLine> lines = new ArrayList<>(
                CreditInvoiceLineBuilder.fuelLines(fuelEntries));
        lines.addAll(CreditInvoiceLineBuilder.ancillaryLines(ancillarySales, productsOf(ancillarySales),
                sellerStateCode.equals(buyerStateCode)));

        CreditInvoice invoice = invoiceRepository.save(withTotals(CreditInvoice.builder()
                .pumpId(pumpId)
                .clientId(clientId)
                .invoiceNumber(invoiceNumber)
                .financialYear(financialYear)
                .sequenceNumber(sequence.getNextNumber())
                .periodFrom(periodFrom)
                .periodTo(periodTo)
                .issuedOn(issuedOn)
                .sellerTradeName(pump.getName())
                .sellerLegalName(pump.getLegalName())
                .sellerAddress(pump.getAddress())
                .sellerGstin(pump.getGstin())
                .sellerStateCode(sellerStateCode)
                .sellerStateName(pump.getStateName())
                .buyerName(client.getName())
                .buyerAddress(client.getBillingAddress())
                .buyerGstin(client.getGstin())
                .buyerStateCode(buyerStateCode)
                .placeOfSupplyStateCode(buyerStateCode)
                .createdBy(issuedBy.getId()), lines)
                .build());
        lines.forEach(line -> line.setInvoiceId(invoice.getId()));
        lineRepository.saveAll(lines);
        sequence.setNextNumber(sequence.getNextNumber() + 1);

        auditService.log(pumpId, AuditAction.CREDIT_INVOICE_ISSUED, "CreditInvoice", invoice.getId().toString(),
                "Invoice " + invoiceNumber + " issued for clientId=" + clientId + " (" + periodFrom + " to " + periodTo
                        + "), total ₹" + invoice.getGrandTotal(), issuedBy);
        log.info("Credit invoice issued: pump={}, client={}, invoice={}, number={}, lines={}",
                pumpId, clientId, invoice.getId(), invoiceNumber, lines.size());
        return Optional.of(invoice);
    }

    private InvoiceSequence lockSequence(Long pumpId, String financialYear) {
        sequenceRepository.createIfMissing(pumpId, financialYear);
        return sequenceRepository.findByIdForUpdate(new InvoiceSequence.Key(pumpId, financialYear))
                .orElseThrow(() -> new IllegalStateException(
                        "Invoice sequence missing after insert for pump " + pumpId + " year " + financialYear));
    }

    private Map<Long, AncillaryProduct> productsOf(List<AncillarySale> sales) {
        List<Long> productIds = sales.stream().map(AncillarySale::getProductId).distinct().toList();
        return productRepository.findAllById(productIds).stream()
                .collect(Collectors.toMap(AncillaryProduct::getId, Function.identity()));
    }

    private static CreditInvoice.CreditInvoiceBuilder withTotals(CreditInvoice.CreditInvoiceBuilder builder,
                                                                 List<CreditInvoiceLine> lines) {
        BigDecimal fuelTotal = sum(lines.stream()
                .filter(line -> line.getLineType() == InvoiceLineType.FUEL)
                .map(CreditInvoiceLine::getLineTotal).toList());
        List<CreditInvoiceLine> ancillaryLines = lines.stream()
                .filter(line -> line.getLineType() == InvoiceLineType.ANCILLARY)
                .toList();
        BigDecimal taxableTotal = sum(ancillaryLines.stream().map(CreditInvoiceLine::getTaxableValue).toList());
        BigDecimal cgstTotal = sum(ancillaryLines.stream().map(CreditInvoiceLine::getCgst).toList());
        BigDecimal sgstTotal = sum(ancillaryLines.stream().map(CreditInvoiceLine::getSgst).toList());
        BigDecimal igstTotal = sum(ancillaryLines.stream().map(CreditInvoiceLine::getIgst).toList());
        return builder
                .fuelTotal(fuelTotal)
                .taxableTotal(taxableTotal)
                .cgstTotal(cgstTotal)
                .sgstTotal(sgstTotal)
                .igstTotal(igstTotal)
                .grandTotal(fuelTotal.add(taxableTotal).add(cgstTotal).add(sgstTotal).add(igstTotal));
    }

    private static BigDecimal sum(List<BigDecimal> amounts) {
        return amounts.stream().reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }
}
