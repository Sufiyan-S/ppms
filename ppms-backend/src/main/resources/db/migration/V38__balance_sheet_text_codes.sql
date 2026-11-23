-- Codes and values the period label and stale reason were built from, so screens can show them in the user's language.
-- Sheets saved before this migration keep NULL here and are shown in their stored English.
ALTER TABLE balance_sheets
    ADD COLUMN period_label_code   VARCHAR(64),
    ADD COLUMN period_label_params JSONB,
    ADD COLUMN stale_reason_code   VARCHAR(64),
    ADD COLUMN stale_reason_params JSONB;
