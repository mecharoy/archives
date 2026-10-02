-- The website link. Run ONCE on the live database, BEFORE deploying the Worker
-- and before releasing the APK that has the "show on website" switch:
--
--   npx wrangler d1 execute site-khata --remote --file migrations/2026-10-site-link.sql
--
-- ALTER TABLE ... ADD COLUMN cannot be repeated (a second run says "duplicate
-- column", which is harmless). The CREATE statements are safe to repeat.
-- A fresh database does not need this file: schema.sql already has all of it.

ALTER TABLE items ADD COLUMN web_hidden INTEGER;

CREATE TABLE IF NOT EXISTS enquiries (
  household_id TEXT NOT NULL,
  id           TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  location     TEXT,
  service      TEXT,
  message      TEXT,
  locale       TEXT,
  PRIMARY KEY (household_id, id)
);
CREATE INDEX IF NOT EXISTS ix_enquiries_h ON enquiries (household_id, received_at);
