package com.ppms.document;

import com.ppms.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pumps")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
public class DocumentController {

    private final DocumentService documentService;

    @GetMapping("/{pumpId}/documents")
    public List<PumpDocument> getDocuments(@PathVariable Long pumpId) {
        return documentService.getDocuments(pumpId);
    }

    @PostMapping("/{pumpId}/documents")
    @ResponseStatus(HttpStatus.CREATED)
    public PumpDocument createDocument(
            @PathVariable Long pumpId,
            @Valid @RequestBody UpsertDocumentRequest req,
            @AuthenticationPrincipal User currentUser) {
        return documentService.createDocument(pumpId, req, currentUser);
    }

    @PutMapping("/{pumpId}/documents/{documentId}")
    public PumpDocument updateDocument(
            @PathVariable Long pumpId,
            @PathVariable Long documentId,
            @Valid @RequestBody UpsertDocumentRequest req) {
        return documentService.updateDocument(pumpId, documentId, req);
    }

    @DeleteMapping("/{pumpId}/documents/{documentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void deleteDocument(
            @PathVariable Long pumpId,
            @PathVariable Long documentId) {
        documentService.deleteDocument(pumpId, documentId);
    }
}
