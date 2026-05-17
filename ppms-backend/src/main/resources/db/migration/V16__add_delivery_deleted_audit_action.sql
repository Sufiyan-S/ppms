-- Adds DELIVERY_DELETED to the audit_action enum so the InventoryController
-- can log when the most-recent invoice is removed via DELETE /deliveries/latest.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DELIVERY_DELETED';
