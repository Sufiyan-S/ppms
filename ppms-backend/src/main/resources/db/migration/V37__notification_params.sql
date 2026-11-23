-- The values a notification's text was built from, so screens can show it in the user's language.
-- Rows written before this column stay NULL and are shown in their stored English.
ALTER TABLE notifications
    ADD COLUMN params JSONB;
