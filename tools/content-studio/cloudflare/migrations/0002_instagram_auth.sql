-- MoolResha Content Studio only. Never store plaintext Meta tokens in D1.
CREATE TABLE IF NOT EXISTS instagram_connections (
  instagram_account_id TEXT PRIMARY KEY,
  facebook_page_id TEXT NOT NULL,
  facebook_page_name TEXT NOT NULL,
  encrypted_user_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_expires_at TEXT,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','revoked'))
);
CREATE TABLE IF NOT EXISTS oauth_sessions (
  state_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires_at ON oauth_sessions(expires_at);
