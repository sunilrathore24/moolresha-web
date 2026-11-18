-- Extends content_jobs so the free-tier GitHub Actions executor can claim a job,
-- record the generated draft, record where media was uploaded (Workers-served R2
-- keys, never a third-party CDN), and record the publish outcome. SQLite cannot
-- ALTER a CHECK constraint, so the table is rebuilt.
CREATE TABLE content_jobs_new (
  job_key TEXT PRIMARY KEY,
  content_kind TEXT NOT NULL CHECK(content_kind IN ('carousel','reel')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','generated','dry-run','published','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  error TEXT,
  draft_payload TEXT,
  media_keys TEXT,
  caption TEXT,
  instagram_media_id TEXT,
  published_at TEXT
);
INSERT INTO content_jobs_new (job_key,content_kind,status,created_at,updated_at,error)
  SELECT job_key,content_kind,status,created_at,updated_at,error FROM content_jobs;
DROP TABLE content_jobs;
ALTER TABLE content_jobs_new RENAME TO content_jobs;
CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs(status,created_at);
