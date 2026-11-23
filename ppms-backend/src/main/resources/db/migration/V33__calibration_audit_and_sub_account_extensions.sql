ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CALIBRATION_LOGGED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'CREDIT_EXTENSION_GRANTED';

-- Credit checks run on the parent account, so ACTIVE extensions granted on a sub-account never took effect.
-- Per parent and type, the latest-expiring one moves to the parent when the parent has no ACTIVE extension of
-- that type over the same dates; every other one is revoked.
CREATE TEMP TABLE sub_account_extensions ON COMMIT DROP AS
SELECT e.id,
       c.parent_client_id,
       ROW_NUMBER() OVER (PARTITION BY e.pump_id, c.parent_client_id, e.extension_type
                          ORDER BY e.expiry_date DESC, e.id DESC) AS pick_order,
       EXISTS (SELECT 1
               FROM credit_extensions p
               WHERE p.pump_id = e.pump_id
                 AND p.client_id = c.parent_client_id
                 AND p.extension_type = e.extension_type
                 AND p.status = 'ACTIVE'
                 AND (p.created_at AT TIME ZONE 'Asia/Kolkata')::date <= e.expiry_date
                 AND p.expiry_date >= (e.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS parent_has_overlap
FROM credit_extensions e
JOIN credit_clients c ON c.id = e.client_id
WHERE e.status = 'ACTIVE'
  AND c.parent_client_id IS NOT NULL;

UPDATE credit_extensions e
SET client_id  = s.parent_client_id,
    updated_at = NOW()
FROM sub_account_extensions s
WHERE e.id = s.id
  AND s.pick_order = 1
  AND NOT s.parent_has_overlap;

-- chk_cext_revoke_fields needs a revoking user with every revoke reason, so the granting user stands in;
-- the audit row below records that this migration, not that user, revoked it.
UPDATE credit_extensions e
SET status             = 'REVOKED',
    revoked_at         = NOW(),
    revoked_by_user_id = e.granted_by_user_id,
    revoke_reason      = 'Granted on a sub-account; superseded by parent extension',
    updated_at         = NOW()
FROM sub_account_extensions s
WHERE e.id = s.id
  AND (s.pick_order > 1 OR s.parent_has_overlap);

INSERT INTO audit_logs (pump_id, action, entity_type, entity_id, description, actor_id, actor_name)
SELECT e.pump_id,
       'CREDIT_EXTENSION_REVOKED',
       'CreditExtension',
       e.id::text,
       e.extension_type || ' for clientId=' || e.client_id || ' (expiring ' || e.expiry_date
           || ') revoked by data migration, reason=' || e.revoke_reason,
       NULL,
       'System'
FROM credit_extensions e
JOIN sub_account_extensions s ON s.id = e.id
WHERE s.pick_order > 1 OR s.parent_has_overlap;
