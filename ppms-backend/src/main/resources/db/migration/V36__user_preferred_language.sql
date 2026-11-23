-- Each user's screen language follows them across the shared pump phones.
ALTER TABLE users
    ADD COLUMN preferred_language VARCHAR(5) NOT NULL DEFAULT 'en';

ALTER TABLE users
    ADD CONSTRAINT chk_users_preferred_language CHECK (preferred_language IN ('en', 'hi', 'mr'));
