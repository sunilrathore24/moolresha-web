CREATE TABLE IF NOT EXISTS content_jobs (
  job_key TEXT PRIMARY KEY,
  content_kind TEXT NOT NULL CHECK(content_kind IN ('carousel','reel')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs(status,created_at);
