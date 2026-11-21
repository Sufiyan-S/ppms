package com.ppms.document;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.common.time.BusinessClock;
import com.ppms.user.User;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DocumentService {

    private static final int EXPIRING_SOON_DAYS = 30;

    private final PumpDocumentRepository documentRepository;
    private final AuditService auditService;
    private final BusinessClock businessClock;

    /** Soonest expiry first; status is recomputed from today's date on every read. */
    @Transactional(readOnly = true)
    public List<PumpDocument> getDocuments(Long pumpId) {
        List<PumpDocument> docs = documentRepository.findByPumpIdOrderByExpiryDateAsc(pumpId, PageRequest.of(0, 500));
        LocalDate today = businessClock.today();
        docs.forEach(doc -> doc.setStatus(statusFor(doc.getExpiryDate(), today)));
        return docs;
    }

    @Transactional
    public PumpDocument createDocument(Long pumpId, UpsertDocumentRequest req, User currentUser) {
        PumpDocument saved = documentRepository.save(PumpDocument.builder()
                .pumpId(pumpId)
                .name(req.getName().trim())
                .docType(req.getDocType().trim())
                .expiryDate(req.getExpiryDate())
                .notes(req.getNotes())
                .status(statusFor(req.getExpiryDate(), businessClock.today()))
                .uploadedByUserId(currentUser.getId())
                .build());

        auditService.log(pumpId, AuditAction.DOCUMENT_ADDED, "PumpDocument",
                saved.getId().toString(),
                "Document added: " + req.getName() + " (" + req.getDocType() + ")",
                currentUser);
        return saved;
    }

    @Transactional
    public PumpDocument updateDocument(Long pumpId, Long documentId, UpsertDocumentRequest req) {
        PumpDocument doc = findDocument(pumpId, documentId);
        doc.setName(req.getName().trim());
        doc.setDocType(req.getDocType().trim());
        doc.setExpiryDate(req.getExpiryDate());
        doc.setNotes(req.getNotes());
        doc.setStatus(statusFor(req.getExpiryDate(), businessClock.today()));
        return documentRepository.save(doc);
    }

    @Transactional
    public void deleteDocument(Long pumpId, Long documentId) {
        documentRepository.delete(findDocument(pumpId, documentId));
    }

    private PumpDocument findDocument(Long pumpId, Long documentId) {
        return documentRepository.findById(documentId)
                .filter(doc -> doc.getPumpId().equals(pumpId))
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
    }

    // No expiry date means the document never expires.
    private DocumentStatus statusFor(LocalDate expiryDate, LocalDate today) {
        if (expiryDate == null) return DocumentStatus.VALID;
        if (expiryDate.isBefore(today)) return DocumentStatus.EXPIRED;
        if (!expiryDate.isAfter(today.plusDays(EXPIRING_SOON_DAYS))) return DocumentStatus.EXPIRING_SOON;
        return DocumentStatus.VALID;
    }
}
