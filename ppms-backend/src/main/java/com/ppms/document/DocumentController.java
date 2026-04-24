package com.ppms.document;

import com.ppms.audit.AuditAction;
import com.ppms.audit.AuditService;
import com.ppms.common.exception.ResourceNotFoundException;
import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
public class DocumentController {

    private final PumpDocumentRepository documentRepository;
    private final AuditService           auditService;

    /**
     * GET /api/pumps/{pumpId}/documents
     * Returns all documents for a pump sorted by expiry date (soonest first).
     * Status is recomputed on every fetch so it stays accurate.
     */
    @GetMapping("/{pumpId}/documents")
    public List<PumpDocument> getDocuments(
            @PathVariable Long pumpId) {
        List<PumpDocument> docs = documentRepository.findByPumpIdOrderByExpiryDateAsc(pumpId, PageRequest.of(0, 500));
        // Refresh computed status based on today's date
        LocalDate today = LocalDate.now();
        docs.forEach(doc -> doc.setStatus(computeStatus(doc.getExpiryDate(), today)));
        return docs;
    }

    /**
     * POST /api/pumps/{pumpId}/documents
     * Adds a new compliance document.
     */
    @PostMapping("/{pumpId}/documents")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public PumpDocument createDocument(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpsertDocumentRequest req,
            @AuthenticationPrincipal User currentUser) {

        LocalDate today = LocalDate.now();
        PumpDocument doc = PumpDocument.builder()
                .pumpId(pumpId)
                .name(req.getName().trim())
                .docType(req.getDocType().trim())
                .expiryDate(req.getExpiryDate())
                .notes(req.getNotes())
                .status(computeStatus(req.getExpiryDate(), today))
                .build();

        PumpDocument saved = documentRepository.save(doc);

        auditService.log(pumpId, AuditAction.DOCUMENT_ADDED, "PumpDocument",
                saved.getId().toString(),
                "Document added: " + req.getName() + " (" + req.getDocType() + ")",
                currentUser);

        return saved;
    }

    /**
     * PUT /api/pumps/{pumpId}/documents/{documentId}
     * Updates an existing document entry.
     */
    @PutMapping("/{pumpId}/documents/{documentId}")
    @Transactional
    public PumpDocument updateDocument(
            @PathVariable Long pumpId,
            @PathVariable Long documentId,
            @Valid @RequestBody UpsertDocumentRequest req) {

        PumpDocument doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!doc.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Document not found");
        }

        LocalDate today = LocalDate.now();
        doc.setName(req.getName().trim());
        doc.setDocType(req.getDocType().trim());
        doc.setExpiryDate(req.getExpiryDate());
        doc.setNotes(req.getNotes());
        doc.setStatus(computeStatus(req.getExpiryDate(), today));

        return documentRepository.save(doc);
    }

    /**
     * DELETE /api/pumps/{pumpId}/documents/{documentId}
     * Removes a document entry. Restricted to OWNER only.
     */
    @DeleteMapping("/{pumpId}/documents/{documentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void deleteDocument(
            @PathVariable Long pumpId,
            @PathVariable Long documentId) {
        PumpDocument doc = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!doc.getPumpId().equals(pumpId)) {
            throw new ResourceNotFoundException("Document not found");
        }
        documentRepository.deleteById(documentId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Computes document status from the expiry date:
     * - null expiry → VALID (no expiry set)
     * - past expiry → EXPIRED
     * - expiry within 30 days → EXPIRING_SOON
     * - otherwise → VALID
     */
    private DocumentStatus computeStatus(LocalDate expiryDate, LocalDate today) {
        if (expiryDate == null) return DocumentStatus.VALID;
        if (expiryDate.isBefore(today)) return DocumentStatus.EXPIRED;
        if (!expiryDate.isAfter(today.plusDays(30))) return DocumentStatus.EXPIRING_SOON;
        return DocumentStatus.VALID;
    }
}
