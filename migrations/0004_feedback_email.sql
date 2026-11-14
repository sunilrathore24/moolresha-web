-- Adds the optional `email` column to concept_feedback and frustration (2026-11): a visitor can
-- choose to leave an email with their feedback so MoolResha can follow up about that specific
-- answer. NULL unless given AND the consent checkbox was ticked
-- (functions/_shared/schemas.ts's FeedbackBody/FrustrationBody enforce the consent check before
-- this is ever written — a row with a non-NULL email is only ever written when consent was
-- given). Used for:
--   1. Admin follow-up: functions/api/admin/stats.json.ts's `contacts` list (admin-only, never
--      part of the public /api/results projection or the existing PII-free feedback CSV export
--      — see functions/_shared/db.ts's exportFeedbackRows, which deliberately does not select
--      this column, keeping Requirement 17.3's "no email or phone" contract intact for that path).
--   2. Cross-device deduplication: a second submission with the same email, for the same
--      Concept (feedback) or at all (frustration, one row per person already), updates that
--      existing row instead of creating a new one — see findFeedbackAnonIdByEmail /
--      findFrustrationAnonIdByEmail in functions/_shared/db.ts. The existing per-browser
--      anon_id upsert (same device, same browser storage) is unchanged and still the primary
--      mechanism; email is an additional, opt-in signal for the same person on a different
--      device.
ALTER TABLE concept_feedback ADD COLUMN email TEXT;
CREATE INDEX idx_feedback_email ON concept_feedback (concept_id, email) WHERE email IS NOT NULL;

ALTER TABLE frustration ADD COLUMN email TEXT;
CREATE INDEX idx_frustration_email ON frustration (email) WHERE email IS NOT NULL;
