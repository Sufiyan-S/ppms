-- Lets the daily retention job find read notifications by age without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at) WHERE read_at IS NOT NULL;
