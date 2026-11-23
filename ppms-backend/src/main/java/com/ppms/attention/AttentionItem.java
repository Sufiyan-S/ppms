package com.ppms.attention;

import java.math.BigDecimal;
import java.util.Map;

/**
 * One thing an owner should act on today.
 *
 * @param amount       money involved, or null when the item is not about money
 * @param reasonCode   names the reason for translated screens; reasonParams fill it, and reason stays the English text
 * @param targetPath   the page that handles it, with the filters that show exactly these records
 */
public record AttentionItem(AttentionType type, AttentionSeverity severity, Long pumpId, String pumpName,
                            long count, BigDecimal amount, String reason, String reasonCode,
                            Map<String, Object> reasonParams, String targetPath) {
}
