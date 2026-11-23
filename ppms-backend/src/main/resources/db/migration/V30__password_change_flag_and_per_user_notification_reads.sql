-- Set when someone else chose the password (account creation, admin reset); existing accounts are not flagged.
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';

-- Read state is per user: a notification is unread for a user until that user has a row here.
CREATE TABLE notification_reads (
    id               BIGSERIAL   PRIMARY KEY,
    notification_id  BIGINT      NOT NULL,
    user_id          BIGINT      NOT NULL,
    read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_reads_user         FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uq_notification_reads_notification_user UNIQUE (notification_id, user_id)
);

CREATE INDEX idx_notification_reads_user_id ON notification_reads (user_id);
CREATE INDEX idx_notification_reads_read_at ON notification_reads (read_at);

-- The old pump-wide read state is kept for everyone who could see the pump when it was read,
-- so nobody's bell fills up with alerts their pump had already cleared.
INSERT INTO notification_reads (notification_id, user_id, read_at)
SELECT n.id, u.id, n.read_at
FROM notifications n
JOIN pump_locations p ON p.id = n.pump_id
JOIN users u ON u.assigned_pump_id = n.pump_id OR u.id = p.owner_id
WHERE n.read_at IS NOT NULL;

-- Dropping the column also drops idx_notif_pump and idx_notifications_read_at, which were built on it.
ALTER TABLE notifications DROP COLUMN read_at;

CREATE INDEX idx_notifications_pump_created_at ON notifications (pump_id, created_at DESC);
