-- Adds the optional general "Any other thoughts?" comment field to concept_feedback
-- (redesign, 2026-11). Distinct from `other_text`, which stays tied to the "other" Change_Chip
-- specifically — this is a new, always-available free-text field, not a conditional reveal.
-- Plain length() CHECK, no GLOB — the known "GLOB pattern too complex" D1 limitation
-- (see docs/deployment-status.md) does not apply here.
--
-- MANUAL STEP (wrangler is not authenticated on this machine): run this directly against the
-- live D1 database via the Cloudflare dashboard's D1 console (Storage & databases → D1 SQLite
-- Database → moolresha_feedback → Console tab) before this redesign branch deploys — the comment
-- field will fail every feedback submission with a DB error until this column exists.
ALTER TABLE concept_feedback ADD COLUMN comment_text TEXT
  CHECK (comment_text IS NULL OR length(comment_text) <= 250);
