CREATE TABLE IF NOT EXISTS studio_drafts (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('carousel','reel')),
 title TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','publishing','published','failed','rejected')),
 media_manifest TEXT,
 scheduled_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 published_at TEXT,
 instagram_media_id TEXT,
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_studio_due ON studio_drafts(status,scheduled_at);
CREATE TABLE IF NOT EXISTS studio_accounts (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL,
 token_ciphertext TEXT NOT NULL,
 token_iv TEXT NOT NULL,
 expires_at TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_events (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL,
 event TEXT NOT NULL,
 details TEXT,
 created_at TEXT NOT NULL
);
