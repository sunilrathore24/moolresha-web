PRAGMA foreign_keys = ON;

-- One row per Anonymous_ID × Concept (Req 9.15). No contact data (Req 9.13).
CREATE TABLE concept_feedback (
  anon_id        TEXT NOT NULL CHECK (length(anon_id) = 36),
  concept_id     TEXT NOT NULL,
  verdict        TEXT NOT NULL CHECK (verdict IN ('would_wear','maybe','not_for_me')),
  changes        TEXT NOT NULL DEFAULT '',          -- '|'-joined allow-listed chips, sorted
  other_text     TEXT CHECK (other_text IS NULL OR length(other_text) <= 200),
  colour         TEXT CHECK (colour IS NULL OR colour IN ('flax','clay','meadow','indigo_dusk','chalk_white')),
  priorities     TEXT NOT NULL DEFAULT '',          -- '|'-joined allow-listed Priority_Chips, sorted; '' = none chosen (Req 9.19)
  price_band_id  TEXT,                              -- allow-listed per Concept in the API; NULL when skipped or unanswered
  price_skipped  INTEGER NOT NULL DEFAULT 0 CHECK (price_skipped IN (0,1)),
  utm_source     TEXT NOT NULL DEFAULT '',
  utm_medium     TEXT NOT NULL DEFAULT '',
  utm_campaign   TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,                     -- ISO 8601 UTC
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (anon_id, concept_id),
  CHECK (price_skipped = 0 OR price_band_id IS NULL) -- a skip never carries a band (Req 9.14)
) WITHOUT ROWID;
CREATE INDEX idx_feedback_concept ON concept_feedback (concept_id);

-- One row per Anonymous_ID (Req 10.3).
CREATE TABLE frustration (
  anon_id     TEXT PRIMARY KEY CHECK (length(anon_id) = 36),
  chips       TEXT NOT NULL,                        -- '|'-joined, sorted, non-empty
  other_text  TEXT CHECK (other_text IS NULL OR length(other_text) <= 200),
  utm_source  TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL, updated_at TEXT NOT NULL
) WITHOUT ROWID;

-- Contact data exists only with consent (Req 12.4, 12.5). anon_id only when link consent given (Req 12.8).
CREATE TABLE interest (
  id          INTEGER PRIMARY KEY,
  anon_id     TEXT UNIQUE,                          -- NULL unless linked = 1
  linked      INTEGER NOT NULL DEFAULT 0 CHECK (linked IN (0,1)),
  email       TEXT UNIQUE,
  phone       TEXT UNIQUE CHECK (phone IS NULL OR phone GLOB '+91[6-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  size        TEXT CHECK (size IS NULL OR size IN ('xs','s','m','l','xl','xxl','prefer_not')),
  ml_sync     TEXT NOT NULL DEFAULT 'none' CHECK (ml_sync IN ('none','pending','sent','failed')),
  utm_source  TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK ((linked = 1) = (anon_id IS NOT NULL))
);

-- Append-only consent log (Req 12.9). Withdrawal is a new row with granted = 0.
CREATE TABLE consents (
  id              INTEGER PRIMARY KEY,
  interest_id     INTEGER NOT NULL REFERENCES interest(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL CHECK (consent_type IN ('email','whatsapp','link','adult')),
  granted         INTEGER NOT NULL CHECK (granted IN (0,1)),
  notice_version  TEXT NOT NULL,
  recorded_at     TEXT NOT NULL
);
CREATE INDEX idx_consents_interest ON consents (interest_id);

-- Day-level counts, no personal data (Req 18.4).
CREATE TABLE event_counts (
  day           TEXT NOT NULL,                      -- YYYY-MM-DD (UTC)
  event         TEXT NOT NULL,
  concept_id    TEXT NOT NULL DEFAULT '',
  section       TEXT NOT NULL DEFAULT '',
  utm_source    TEXT NOT NULL DEFAULT '', utm_medium TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '',
  count         INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, event, concept_id, section, utm_source, utm_medium, utm_campaign)
) WITHOUT ROWID;

-- Fixed-window rate limiting (docs/rate-limiting.md). key = route:sha256hex.
CREATE TABLE rate_limits (
  key           TEXT NOT NULL,
  window_start  INTEGER NOT NULL,                   -- unix seconds
  count         INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
CREATE INDEX idx_rate_limits_expiry ON rate_limits (expires_at);
